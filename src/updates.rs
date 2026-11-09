//! A release notification and download link, using GitHub's published stable release.
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub const RELEASES_URL: &str = "https://github.com/SandpiperMediaGroup/tinytasks/releases/latest";
const RELEASE_API: &str = "https://api.github.com/repos/SandpiperMediaGroup/tinytasks/releases/latest";
const CURRENT: &str = env!("CARGO_PKG_VERSION");
const DAY: i64 = 86_400;

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
struct Cache {
    attempted_at: i64,
    latest_version: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Status {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
}

impl Cache {
    fn recent(&self, now: i64) -> bool {
        self.attempted_at > 0 && self.attempted_at <= now && now - self.attempted_at < DAY
    }

    fn status(&self) -> Status {
        Status {
            current_version: CURRENT.into(),
            latest_version: self.latest_version.clone(),
            update_available: self.latest_version.as_deref().is_some_and(|version| newer(version, CURRENT)),
        }
    }
}

fn newer(latest: &str, installed: &str) -> bool {
    match (semver::Version::parse(latest), semver::Version::parse(installed)) {
        (Ok(latest), Ok(installed)) => latest.pre.is_empty() && latest.cmp_precedence(&installed).is_gt(),
        _ => false,
    }
}

fn release_version(body: &[u8]) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Release { tag_name: String, draft: bool, prerelease: bool }
    let release: Release = serde_json::from_slice(body).map_err(|_| "GitHub returned an unreadable release.".to_string())?;
    let version = release.tag_name.strip_prefix('v').unwrap_or(&release.tag_name);
    let parsed = semver::Version::parse(version).map_err(|_| "The latest release has an invalid version number.".to_string())?;
    if release.draft || release.prerelease || !parsed.pre.is_empty() {
        return Err("No published stable release is available.".into());
    }
    Ok(parsed.to_string())
}

fn fetch_release() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(concat!("TinyTasks/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .timeout(Duration::from_secs(8))
        .build().map_err(|_| "Could not start the update check.".to_string())?;
    let response = client.get(RELEASE_API).header("Accept", "application/vnd.github+json")
        .send().map_err(|_| "Could not reach GitHub. Please try again.".to_string())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("No published release is available yet.".into()),
        403 | 429 => return Err("GitHub is limiting update checks. Please try again later.".into()),
        _ => return Err("GitHub could not complete the update check. Please try again.".into()),
    }
    // Release notes are untrusted network data; cap the response before deserializing it.
    let mut body = Vec::new();
    response.take(1_048_577).read_to_end(&mut body).map_err(|_| "Could not read the release information.".to_string())?;
    if body.len() > 1_048_576 { return Err("The release information was too large.".into()); }
    release_version(&body)
}

/// Called on a worker thread. All windows share a cache, including failed attempts,
/// so an unavailable network cannot turn background checks into repeated requests.
pub fn check(force: bool) -> Result<Status, String> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let file = crate::store::data_dir().join("release-check.json");
    let cache = CACHE.get_or_init(|| Mutex::new(std::fs::read(&file).ok()
        .and_then(|body| serde_json::from_slice(&body).ok()).unwrap_or_default()));
    let mut cache = cache.lock().map_err(|_| "The update check is unavailable. Please restart TinyTasks.".to_string())?;
    let now = crate::store::now();
    if !force && cache.recent(now) { return Ok(cache.status()); }
    cache.attempted_at = now;
    let result = fetch_release();
    if let Ok(version) = &result { cache.latest_version = Some(version.clone()); }
    if let Ok(body) = serde_json::to_vec(&*cache) {
        let temp = file.with_extension("tmp");
        if std::fs::write(&temp, body).is_ok() { let _ = std::fs::rename(temp, &file); }
    }
    result.map(|_| cache.status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_numerically_without_build_metadata_or_downgrades() {
        assert!(newer("0.10.0", "0.9.9"));
        assert!(!newer("0.9.9", "0.10.0"));
        assert!(!newer("1.2.0+new", "1.2.0+old"));
        assert!(!newer("1.2.0-beta.1", "1.1.0"));
        assert!(newer("1.2.0", "1.2.0-beta.1"));
        assert!(!newer("invalid", "1.0.0"));
    }

    #[test]
    fn only_valid_published_stable_tags_are_accepted() {
        assert_eq!(release_version(br#"{"tag_name":"v0.10.0","draft":false,"prerelease":false}"#).unwrap(), "0.10.0");
        for body in [
            br#"{"tag_name":"v2.0.0","draft":true,"prerelease":false}"#.as_slice(),
            br#"{"tag_name":"v2.0.0","draft":false,"prerelease":true}"#.as_slice(),
            br#"{"tag_name":"v2.0.0-beta.1","draft":false,"prerelease":false}"#.as_slice(),
            br#"{"tag_name":"latest","draft":false,"prerelease":false}"#.as_slice(),
            b"{}".as_slice(),
        ] { assert!(release_version(body).is_err()); }
    }

    #[test]
    fn cache_expires_daily_and_recovers_from_clock_changes() {
        let cache = Cache { attempted_at: 100, latest_version: None };
        assert!(cache.recent(101));
        assert!(!cache.recent(100 + DAY));
        assert!(!cache.recent(99));
        assert!(!cache.status().update_available);
        assert!(cache.status().latest_version.is_none());
    }

    #[test]
    #[ignore = "requires GitHub network access"]
    fn live_github_release_can_be_checked() {
        assert!(semver::Version::parse(&fetch_release().unwrap()).is_ok());
    }
}
