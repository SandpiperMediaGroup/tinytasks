//! Draws the tray icon: a yellow sticky square showing the open-task count
//! (or a check mark when there's nothing to do). No image files or font deps.

const S: usize = 64;
const BG: [u8; 3] = [255, 214, 92];
const INK: [u8; 3] = [40, 36, 30];

// 3x5 bitmap digits, one row per u8 (low 3 bits, left = 0b100).
const DIGITS: [[u8; 5]; 10] = [
    [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
    [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];

/// Returns (rgba, width, height).
pub fn render(count: i64) -> (Vec<u8>, u32, u32) {
    let mut px = vec![0u8; S * S * 4];
    let put = |px: &mut Vec<u8>, x: usize, y: usize, c: [u8; 3], a: f32| {
        if a <= 0.0 { return; }
        let i = (y * S + x) * 4;
        let a = a.min(1.0);
        for k in 0..3 {
            px[i + k] = (px[i + k] as f32 * (1.0 - a) + c[k] as f32 * a) as u8;
        }
        px[i + 3] = px[i + 3].max((a * 255.0) as u8);
    };

    // Rounded square background.
    let (m, r) = (2.0f32, 12.0f32);
    for y in 0..S {
        for x in 0..S {
            let (cx, cy) = (x as f32 + 0.5, y as f32 + 0.5);
            let qx = (cx - S as f32 / 2.0).abs() - (S as f32 / 2.0 - m - r);
            let qy = (cy - S as f32 / 2.0).abs() - (S as f32 / 2.0 - m - r);
            let d = qx.max(0.0).hypot(qy.max(0.0)) + qx.max(qy).min(0.0) - r;
            put(&mut px, x, y, BG, 0.5 - d);
        }
    }

    if count <= 0 {
        // Check mark.
        let segs = [((17.0, 33.0), (28.0, 44.0)), ((28.0, 44.0), (47.0, 22.0))];
        for y in 0..S {
            for x in 0..S {
                let p = (x as f32 + 0.5, y as f32 + 0.5);
                let d = segs.iter().map(|&(a, b)| seg_dist(p, a, b)).fold(f32::MAX, f32::min);
                put(&mut px, x, y, INK, 5.5 - d);
            }
        }
    } else {
        let text = count.min(99).to_string();
        let scale = if text.len() == 1 { 8 } else { 6 };
        let gap = scale / 2 + 1;
        let w = text.len() * 3 * scale + (text.len() - 1) * gap;
        let (x0, y0) = ((S - w) / 2, (S - 5 * scale) / 2);
        for (n, ch) in text.bytes().enumerate() {
            let glyph = DIGITS[(ch - b'0') as usize];
            let gx = x0 + n * (3 * scale + gap);
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..3 {
                    if bits & (4 >> col) != 0 {
                        for dy in 0..scale {
                            for dx in 0..scale {
                                put(&mut px, gx + col * scale + dx, y0 + row * scale + dy, INK, 1.0);
                            }
                        }
                    }
                }
            }
        }
    }
    (px, S as u32, S as u32)
}

fn seg_dist(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let (abx, aby) = (b.0 - a.0, b.1 - a.1);
    let t = (((p.0 - a.0) * abx + (p.1 - a.1) * aby) / (abx * abx + aby * aby)).clamp(0.0, 1.0);
    (p.0 - a.0 - abx * t).hypot(p.1 - a.1 - aby * t)
}

#[cfg(test)]
mod tests {
    /// `TINYTASKS_ICON_DUMP=dir cargo test` writes raw RGBA badges for eyeballing.
    #[test]
    fn renders_all_sizes() {
        for n in [0, 3, 12, 250] {
            let (px, w, h) = super::render(n);
            assert_eq!(px.len(), (w * h * 4) as usize);
            if let Ok(dir) = std::env::var("TINYTASKS_ICON_DUMP") {
                std::fs::write(format!("{dir}/badge_{n}.rgba"), &px).unwrap();
            }
        }
    }
}
