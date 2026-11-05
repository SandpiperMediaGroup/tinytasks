"""Exercise the real MCP binary with isolated task and state folders.
Run after cargo build: python3 scripts/mcp-smoke.py
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile

binary = Path(__file__).resolve().parents[1] / 'target/debug/tinytasks'
with tempfile.TemporaryDirectory(prefix='tinytasks-mcp-') as folder:
    task_file = Path(folder) / 'tasks.md'
    env = dict(os.environ, TINYTASKS_DATA_DIR=folder, TINYTASKS_FILE=str(task_file), TINYTASKS_NO_LAUNCH='1')
    process = subprocess.Popen([str(binary), 'mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    sequence = 0

    def request(method, params):
        global sequence
        sequence += 1
        process.stdin.write(json.dumps(dict(jsonrpc='2.0', id=sequence, method=method, params=params)) + '\n')
        process.stdin.flush()
        response = json.loads(process.stdout.readline())
        assert 'error' not in response, response
        return response['result']

    def call(name, arguments, error=False):
        result = request('tools/call', dict(name=name, arguments=arguments))
        assert result['isError'] == error, result
        return result['content'][0]['text']

    def listed(**kwargs):
        return json.loads(call('list_tasks', kwargs))

    try:
        request('initialize', dict(clientInfo=dict(name='codex-test'), protocolVersion='2025-06-18'))
        names = {t['name'] for t in request('tools/list', {})['tools']}
        assert 'reorder_subtasks' in names
        call('add_tasks', dict(tasks=[dict(title='Billing launch', details='Parent notes')], chat='Launch', link='https://example.com/chat', ordered=True))
        parent = listed()[0]['id']
        call('add_tasks', dict(parent_id=parent, tasks=[dict(title='Create key', details='Use production'), dict(title='Add secret'), dict(title='Test checkout')]))
        children = listed(parent_id=parent)
        ids = [t['id'] for t in children]
        assert [t['position'] for t in children] == [0, 1, 2]
        assert all(t['parent_id'] == parent and t['chat'] == 'Launch' and t['link'] == 'https://example.com/chat' for t in children)
        assert children[0]['details'] == 'Use production'
        call('reorder_subtasks', dict(parent_id=parent, ids=ids[::-1]))
        assert [t['id'] for t in listed(parent_id=parent)] == ids[::-1]
        call('update_task', dict(id=parent, ordered=False))
        assert [t['id'] for t in listed(parent_id=parent)] == ids[::-1]
        call('update_task', dict(id=parent, ordered=True))
        before = task_file.read_text()
        call('reorder_subtasks', dict(parent_id=parent, ids=[ids[0], ids[0], ids[2]]), error=True)
        assert task_file.read_text() == before
        call('add_tasks', dict(parent_id=parent, tasks=[dict(title='Valid'), dict(title='Invalid', priority=9)]), error=True)
        assert task_file.read_text() == before
        call('add_tasks', dict(parent_id=ids[0], tasks=[dict(title='Too deep')]), error=True)
        assert task_file.read_text() == before
        call('add_tasks', dict(parent_id=parent, tasks=[dict(title='New agent step')]))
        call('reorder_subtasks', dict(parent_id=parent, ids=ids), error=True)
        assert len(listed(parent_id=parent)) == 4
        call('complete_tasks', dict(ids=[ids[0]]))
        assert next(t for t in listed() if t['id'] == parent)['status'] == 'open'
        assert next(t for t in listed(parent_id=parent) if t['id'] == ids[0])['status'] == 'done'
        call('complete_tasks', dict(ids=[parent]))
        assert all(t['status'] == 'done' for t in listed(parent_id=parent))
        call('add_tasks', dict(parent_id=parent, tasks=[dict(title='Reopens parent')]))
        assert next(t for t in listed() if t['id'] == parent)['status'] == 'open'
        call('update_task', dict(id=parent, chat='Moved chat'))
        assert all(t['chat'] == 'Moved chat' for t in listed(parent_id=parent))
        # Edits preserve the relationship and positional metadata on disk.
        call('update_task', dict(id=ids[1], title='Updated secret', details='New details', priority=1))
        assert next(t for t in listed(parent_id=parent) if t['id'] == ids[1])['details'] == 'New details'
        call('remove_tasks', dict(ids=[ids[0]]))
        assert len(listed(parent_id=parent)) == 4
        call('remove_tasks', dict(ids=[parent]))
        assert listed() == []
        print('PASS: real MCP creation, inherited context, mode/order persistence, atomic validation, stale-order rejection, completion, parent reopening, edits, and cascade deletion.')
    finally:
        process.stdin.close()
        process.wait(timeout=10)
