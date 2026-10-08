"""Offline DOM/component tests. No URL policy changes, network or native-storage claims."""
import json,re,argparse,tempfile,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--browser',help='Chromium executable; otherwise use system chromium or Playwright Chromium')
parser.add_argument('--output',type=Path,default=Path(tempfile.gettempdir())/'handdrawn-survey-qa')
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];OUT=args.output;OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'viewer/survey.html').read_text(encoding='utf-8')
html=re.sub(r'<link rel="stylesheet"[^>]+>',lambda m:'<style>'+(ROOT/'viewer/survey.css').read_text(encoding='utf-8')+'</style>',html)
html=re.sub(r'<script type="module"[^>]*></script>','',html)
core=re.sub(r'^export ', '', (ROOT/'viewer/dimension-audit.js').read_text(encoding='utf-8'), flags=re.M)
ui=re.sub(r'^import .*?;\n','',(ROOT/'viewer/survey.js').read_text(encoding='utf-8'),count=1)
bundle='(()=>{\n'+core+'\n'+ui+'\n})();'
source={f'/{name}':json.loads((ROOT/name).read_text(encoding='utf-8')) for name in ['house_parameters.json','plan_floor_1.json','plan_floor_2.json']}
def mount(context,stored=None,values=None,failed=None,storage_fail=False):
    page=context.new_page();page.set_content(html)
    page.evaluate('''config=>{
      window.__fixture=config.values;window.__store=new Map(Object.entries(config.stored||{}));window.__exports=[];window.__blobs=new Map();
      Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__store.get(k)??null,setItem:(k,v)=>{if(config.storageFail)throw new Error('quota fixture');window.__store.set(k,v);}}});
      window.fetch=async url=>new Response(JSON.stringify(window.__fixture[url]),{status:config.failed===url?404:200,headers:{'Content-Type':'application/json'}});
      const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=original(blob);window.__blobs.set(url,blob);return url;};
      HTMLAnchorElement.prototype.click=function(){const blob=window.__blobs.get(this.href);if(blob)blob.text().then(text=>window.__exports.push({name:this.download,text}));};
      window.print=()=>{window.__printedRows=document.querySelectorAll('#ledger tr').length;};
    }''',{'values':values or source,'stored':stored,'failed':failed,'storageFail':storage_fail})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_script_tag(content=bundle)
    page.wait_for_function("document.getElementById('audit-status').textContent!=='正在校核…'")
    return page,errors
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=args.browser or shutil.which('chromium'),headless=True)
    results=[]
    for width,height in [(1440,1100),(390,844),(768,1024),(360,780)]:
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=width<900,is_mobile=width<650)
        page,errors=mount(context)
        assert page.locator('#audit-status').inner_text()=='未发现数据冲突'
        assert page.locator('#ledger tr').count()==42
        assert page.locator('.space').count()==17
        assert page.locator('#nominal').inner_text()=='4.00 × 4.50 m'
        assert page.locator('#clear').inner_text()=='3.67 × 4.17 m'
        overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not overflow,(width,'page horizontal overflow')
        page.screenshot(path=str(OUT/f'survey-{width}.png'),full_page=False)
        page.locator('[data-floor="2"]').click()
        assert page.locator('.space').count()==14
        assert page.get_by_text('前院上方挑空 · 无楼板',exact=True).count()==1
        page.locator('#room-select').select_option('bedroom-east')
        assert page.locator('#room-title').inner_text()=='卧室3'
        page.locator('[data-floor="1"]').click()
        page.locator('#group-filter').select_option('边界')
        assert page.locator('#ledger tr').count()==5
        page.get_by_role('button',name='录入场地总宽',exact=True).click()
        page.locator('#measured-value').fill('14680')
        page.locator('#measured-by').fill('测试记录（非现场实测）')
        page.locator('#measured-reference').fill('自动化测试 fixture A—B')
        page.locator('#measured-note').fill('仅用于软件验证')
        page.get_by_role('button',name='保存现场记录').click()
        assert page.locator('#record-dialog').is_hidden()
        assert '1 / 42' in page.locator('#record-count').inner_text()
        row=page.locator('tr[data-field="site_width"]')
        assert '已记录，未应用' in row.inner_text() and '-20 mm' in row.inner_text()
        # Remount with serialized mock storage. This is not a native reload/persistence test.
        stored=page.evaluate('Object.fromEntries(window.__store)');page.close()
        page,errs=mount(context,stored=stored);errors.extend(errs)
        assert '1 / 42' in page.locator('#record-count').inner_text()
        page.get_by_role('button',name='导出现场记录 JSON').click()
        page.wait_for_function('window.__exports.length===1')
        packet=json.loads(page.evaluate('window.__exports[0].text'))
        assert len(packet['records'])==1
        page.get_by_role('button',name='导出复测清单 CSV').click()
        page.wait_for_function('window.__exports.length===2')
        csv=page.evaluate('window.__exports[1].text');assert '主卧' in csv and 'south-kitchen' in csv
        page.get_by_role('button',name='查看或修改场地总宽',exact=True).click()
        page.locator('#measured-basis').select_option('finished');page.get_by_role('button',name='保存现场记录').click()
        row=page.locator('tr[data-field="site_width"]');assert '口径不同，不直接比较' in row.inner_text();assert '相对模型' not in row.inner_text()
        page.locator('#import-records').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"schema_version":1,"records":[{"id":"unknown"}]}'})
        page.wait_for_function("document.getElementById('storage-message').textContent.includes('导入失败')")
        assert '1 / 42' in page.locator('#record-count').inner_text()
        page.locator('#group-filter').select_option('边界');page.get_by_role('button',name='打印',exact=True).click()
        assert page.evaluate('window.__printedRows')==42
        assert page.locator('#ledger tr').count()==5
        assert not errors,errors
        results.append({'viewport':f'{width}x{height}','passed':True,'page_errors':errors,'page_overflow':overflow,'mode':'offline DOM; injected resource JSON and mock storage/export/print','checks':['load','floor_switch','room_selection','filter','record_save','serialized_record_reload','export_payloads','basis_mismatch','atomic_import_rejection','print_selects_all_rows']})
        context.close()
    context=browser.new_context();page,errors=mount(context,failed='/plan_floor_2.json')
    assert page.locator('#load-error').is_visible() and page.locator('#content').is_hidden()
    assert not errors;results.append({'case':'source_load_failure','passed':True});context.close()
    values=json.loads(json.dumps(source));values['/house_parameters.json']['site_width']='14700'
    context=browser.new_context();page,errors=mount(context,values=values)
    assert '冲突' in page.locator('#audit-status').inner_text() and page.locator('.plan-svg').count()==0
    assert not errors;results.append({'case':'invalid_parameters','passed':True});context.close()
    context=browser.new_context();page,errors=mount(context,stored={'HanddrawnHouse:measurements:v1':'not valid json'})
    assert '无法读取' in page.locator('#storage-message').inner_text()
    assert not errors;results.append({'case':'corrupt_storage','passed':True});context.close()
    context=browser.new_context();page,errors=mount(context,storage_fail=True)
    page.get_by_role('button',name='录入场地总宽',exact=True).click()
    page.locator('#measured-value').fill('14700');page.locator('#measured-by').fill('测试');page.locator('#measured-reference').fill('测试')
    page.get_by_role('button',name='保存现场记录').click()
    assert '未能持久保存' in page.locator('#storage-message').inner_text()
    assert '1 / 42' in page.locator('#record-count').inner_text()
    assert not errors;results.append({'case':'storage_write_failure','passed':True});context.close()
    browser.close();(OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(results,ensure_ascii=False,indent=2))
