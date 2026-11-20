"""Real stdio MCP checks for opt-in agent workflows; temporary data only."""
import json, os, subprocess, tempfile
from pathlib import Path
binary = Path(os.environ.get('TINYTASKS_SMOKE_BINARY', Path(__file__).resolve().parents[1] / 'target/debug/tinytasks'))
with tempfile.TemporaryDirectory(prefix='tinytasks-agents-') as folder:
    file=Path(folder)/'tasks.md'
    env=dict(os.environ,TINYTASKS_DATA_DIR=folder,TINYTASKS_FILE=str(file),TINYTASKS_NO_LAUNCH='1')
    proc=subprocess.Popen([str(binary),'mcp'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,env=env)
    sequence=0
    def request(method,params):
        global sequence
        sequence+=1;proc.stdin.write(json.dumps(dict(jsonrpc='2.0',id=sequence,method=method,params=params))+'\n');proc.stdin.flush()
        result=json.loads(proc.stdout.readline());assert 'error' not in result,result
        return result['result']
    def call(name,args,error=None):
        result=request('tools/call',dict(name=name,arguments=args));value=json.loads(result['content'][0]['text'])
        assert bool(result.get('isError'))==bool(error),(name,result)
        if error: assert value['code']==error,(name,value)
        return value
    source=dict(client_id='smoke',conversation_id='test-conversation',title='One conversation')
    try:
        init=request('initialize',dict(clientInfo=dict(name='test'),protocolVersion='2025-06-18'))
        tools={x['name']:x for x in request('tools/list',{})['tools']}
        assert {'list_lists','list_tasks_page','create_tasks','publish_question','get_question','list_question_responses','acknowledge_question_response','withdraw_question','begin_desk_planning','report_desk_planning','submit_desk_plan'}<=tools.keys()
        assert not {'submit_question_response','answer_question','review_desk'}&tools.keys()
        lists=call('list_lists',{});assert lists['store_uuid'] is None
        create=dict(source=source,request_id='create',destination_list='',tasks=[dict(title='Review preview',details='[Scout](http://localhost:3000)'),dict(title='Check details')])
        tasks=call('create_tasks',create);before=file.read_bytes()
        again=call('create_tasks',create);assert again['replayed'] and again['tasks']==tasks['tasks'];assert file.read_bytes()==before
        call('create_tasks',dict(create, tasks=[dict(title='Different')]),'idempotency_conflict');assert file.read_bytes()==before
        call('create_tasks',dict(create,request_id='invalid',tasks=[dict(title='Would be valid'),dict(title='Invalid',priority=99)]),'invalid_request');assert file.read_bytes()==before
        call('create_tasks',dict(create,request_id='missing',destination_list='Unknown'),'unknown_list');assert file.read_bytes()==before
        first=call('list_tasks_page',dict(limit=1));second=call('list_tasks_page',dict(limit=1,cursor=first['next_cursor']));assert second['items'][0]['title']=='Check details'
        created=call('create_list',dict(source=source,request_id='list',name='Work',purpose='Ongoing work'))
        reused=call('create_list',dict(source=source,request_id='list-reuse',name='work',purpose='Ongoing work'));assert not reused['created'] and reused['name']=='Work'
        call('list_tasks_page',dict(limit=1,cursor=first['next_cursor']),'stale_cursor')
        page=call('list_tasks_page',{});ref={k:page['items'][0][k] for k in ['id','uid']}
        assert page['items'][0]['source']==source and page['items'][0]['list_name']==''
        question=dict(source=source,request_id='ask',store_uuid=tasks['store_uuid'],task_ref=ref,question=dict(prompt='Which version?',mode='single',options=[dict(id='a',label='Original'),dict(id='b',label='New')],default_option_ids=['a']))
        q=call('publish_question',question)['question'];assert q['response'] is None and q['revision']['prompt']=='Which version?'
        read=dict(source=source,store_uuid=tasks['store_uuid'],question_id=q['question_id'])
        assert call('get_question',read)['question']['revision']['options']==question['question']['options']
        call('get_question',dict(read,source=dict(client_id='smoke',conversation_id='wrong')),'source_mismatch')
        call('withdraw_question',dict(read,request_id='withdraw',expected_revision_id=q['revision']['revision_id']))
        assert call('get_question',read)['question']['revision']['disposition']=='withdrawn'
        day=call('get_desk',{})['date'];begin=dict(source=source,date=day,request_id='plan')
        run=call('begin_desk_planning',begin);assert call('get_desk',{})['planning']['status']=='building'
        assert call('begin_desk_planning',begin)['run_id']==run['run_id']
        call('report_desk_planning',dict(source=source,date=day,request_id='progress',run_id=run['run_id'],status='working'))
        plan=call('submit_desk_plan',dict(source=source,date=day,request_id='submit',run_id=run['run_id'],items=[dict(ref,start='10:00',duration=30)]))
        desk=call('get_desk',{});assert desk['items']==[] and desk['proposal']['id']==plan['proposal_id']
        assert desk['planning']['status']=='suggested'
        print('PASS: real MCP discovery, complete pagination, list reuse, retry replay/conflicts, atomic rejected writes, source identity, optional question publication/withdrawal, and explicit planning to review.')
    finally:
        proc.stdin.close();proc.wait(timeout=5)
