"""Seed or poll the isolated local-review store. Never accesses the user's default tasks."""
import json, os, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'artifacts/review/sample-data'
folder.mkdir(parents=True,exist_ok=True)
env=dict(os.environ,TINYTASKS_FILE=str(folder/'tasks.md'),TINYTASKS_DATA_DIR=str(folder/'state'),TINYTASKS_NO_LAUNCH='1')
binary=root/'target/debug/tinytasks'
p=subprocess.Popen([str(binary),'mcp'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,env=env)
seq=0
source=dict(client_id='review-helper',conversation_id='local-usability-review',title='TinyTasks review helper')
def request(method,params):
    global seq
    seq+=1;p.stdin.write(json.dumps(dict(jsonrpc='2.0',id=seq,method=method,params=params))+'\n');p.stdin.flush()
    r=json.loads(p.stdout.readline());assert 'error' not in r,r
    return r['result']
def call(name,args):
    r=request('tools/call',dict(name=name,arguments=args));assert not r.get('isError'),r
    return json.loads(r['content'][0]['text'])
try:
    request('initialize',dict(clientInfo=dict(name='TinyTasks review helper'),protocolVersion='2025-06-18'))
    if '--seed' in sys.argv:
        assert not (folder/'tasks.md').exists(),'Sample data already exists; preserving your review changes.'
        for name,purpose in [('Studio','Ongoing studio projects'),('Empty example','Demonstrate empty-list cleanup')]:
            call('create_list',dict(source=source,request_id='list-'+name,name=name,purpose=purpose))
        result=call('create_tasks',dict(source=source,request_id='sample-tasks',destination_list='Studio',tasks=[
            dict(title='Review the new TinyTasks details',details='Open [TinyTasks project](https://github.com/SandpiperMediaGroup/tinytasks) or [Scout preview](http://localhost:3000).\n\nNamed links become chips. Edit this description to rename a chip or change its address. The localhost example needs your own preview server.'),
            dict(title='Prepare the studio handoff',details='Try opening these details after the first row. Only one branch stays open. This task is on My Desk, so it has a lamp in this list.',mydesk=True),
            dict(title='Confirm the next review time',details='This is another accepted desk task. Try Clear time in its Desk time picker.',mydesk=True)]))
        refs=[{k:t[k] for k in ['id','uid']} for t in result['tasks']]
        call('create_tasks',dict(source=source,request_id='steps',parent_ref=refs[1],ordered=True,tasks=[dict(title='Check the handoff notes',details='Drag this row to change step order.'),dict(title='Collect feedback'),dict(title='Send the final handoff')]))
        q=call('publish_question',dict(source=source,request_id='sample-question',store_uuid=result['store_uuid'],task_ref=refs[0],question=dict(prompt='Which part would you like to review first?',mode='single',options=[dict(id='details',label='Task details and links',description='Try the named chips and single open branch.'),dict(id='desk',label='My Desk',description='Try the guide, scheduling, and Clear time.'),dict(id='lists',label='List cleanup',description='Right-click the sidebar to archive the empty example.')],default_option_ids=['details'],recommended_option_id='details',allow_custom=True)))
        (folder/'question.json').write_text(json.dumps(q['question'],indent=2)+'\n')
        print('Seeded isolated sample data:',folder)
    elif '--ask-again' in sys.argv:
        import uuid
        saved=json.loads((folder/'question.json').read_text())
        view=call('get_question',dict(source=source,store_uuid=saved['store_uuid'],question_id=saved['question_id']))['question']
        question={key:view['revision'][key] for key in ['prompt','mode','options','default_option_ids','recommended_option_id','allow_custom'] if key in view['revision']}
        result=call('publish_question',dict(source=source,request_id=str(uuid.uuid4()),store_uuid=view['store_uuid'],task_ref=dict(id=view['family']['task_id_at_creation'],uid=view['family']['task_uid']),question_id=view['question_id'],expected_revision_id=view['revision']['revision_id'],question=question))
        (folder/'question.json').write_text(json.dumps(result['question'],indent=2)+'\n')
        print('Published a fresh sample question for review.')
    else:
        state=call('list_lists',{})
        responses=call('list_question_responses',dict(source=source,store_uuid=state['store_uuid']))
        for item in responses['responses']:
            response=item['response'];print(json.dumps(response,ensure_ascii=False,indent=2))
            call('acknowledge_question_response',dict(source=source,request_id='ack-'+response['response_id'],store_uuid=state['store_uuid'],question_id=response['question_id'],revision_id=response['revision_id'],response_id=response['response_id']))
        print('Acknowledged',len(responses['responses']),'sample response(s).')
finally:
    p.stdin.close();p.wait(timeout=5)
