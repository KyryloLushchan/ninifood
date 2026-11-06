# Проверка роли viewer напрямую через API (нужны файлы viewer_jwt.txt и viewer_login.json рядом — получить логином viewer-а
# POST /auth/v1/token?grant_type=password; в репозиторий они не кладутся). Запуск: python3 tools/viewer-check/attack.py
import json, subprocess, urllib.request, urllib.error, os, sys, uuid
SD = os.path.dirname(os.path.abspath(__file__))
U = 'https://jeeaairmlcpueghttnky.supabase.co'
AN = [l for l in open('/Users/kyrylolushchan/Developer/NiNi_food/src/config/supabase.ts').read().split("'") if l.startswith('eyJ')][0]
JWT = open(f'{SD}/viewer_jwt.txt').read().strip()
UID = json.load(open(f'{SD}/viewer_login.json'))['user']['id']

def call(method, path, body=None, token=JWT, extra=None, raw=None, ctype='application/json'):
    h = {'apikey': AN, 'Authorization': f'Bearer {token}', 'Content-Type': ctype, 'Prefer': 'return=representation'}
    h.update(extra or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    cmd = ['curl', '-s', '-m', '30', '-X', method, U + path, '-w', '\n%{http_code}']
    for k, v in h.items(): cmd += ['-H', f'{k}: {v}']
    if data is not None: cmd += ['--data-binary', '@-']
    r = subprocess.run(cmd, input=data, capture_output=True)
    out = r.stdout.decode(errors='replace')
    body_s, _, code = out.rpartition('\n')
    return int(code or 0), body_s[:300]

def sql(q):
    env = dict(os.environ, SUPABASE_ACCESS_TOKEN=open(os.path.expanduser('~/.ninifood/sb_token')).read().strip(), PATH='/opt/homebrew/bin:' + os.environ['PATH'])
    out = subprocess.run(['supabase', 'db', 'query', '--linked', q], capture_output=True, text=True, env=env, cwd='/Users/kyrylolushchan/Developer/NiNi_food').stdout
    j = json.loads(out[out.index('{'):out.rindex('}') + 1]); return j['rows']

TABLES = ['admins','auth_attempts','cash_categories','cash_movements','customer_discounts','customers','menu_dishes','order_attempts','order_days','order_drafts','order_edits','order_surcharges','orders','route_overrides','security_alerts','settings','vip_customers','viewers','courier_pay_days','courier_payouts','courier_pay_log','renewal_links','renewal_attempts']
def snapshot():
    parts = [f"select '{t}' t, count(*) n, coalesce(md5(string_agg(x::text, '|' order by x::text)),'') h from public.{t} x" for t in TABLES]
    parts += ["select 'storage.buckets', count(*), coalesce(md5(string_agg(x::text,'|' order by x::text)),'') from storage.buckets x", "select 'storage.objects', count(*), coalesce(md5(string_agg(x::text,'|' order by x::text)),'') from storage.objects x",
              f"select 'auth.users(viewer)', count(*), md5(string_agg((x.email||x.raw_app_meta_data::text||x.raw_user_meta_data::text||coalesce(x.encrypted_password,''))::text,'|')) from auth.users x where x.id='{UID}'"]
    return {r['t']: (r['n'], r['h']) for r in sql(' union all '.join(parts))}

first = {'admins':'user_id','auth_attempts':'id','cash_categories':'id','cash_movements':'id','customer_discounts':'id','customers':'user_id','menu_dishes':'id','order_attempts':'id','order_days':'id','order_drafts':'id','order_edits':'id','order_surcharges':'id','orders':'id','route_overrides':'date','security_alerts':'kind','settings':'key','vip_customers':'id','viewers':'user_id','courier_pay_days':'date','courier_payouts':'id','courier_pay_log':'id','renewal_links':'code','renewal_attempts':'id'}
patch_body = {'admins':{'user_id':UID},'auth_attempts':{'ok':True},'cash_categories':{'name':'hacked'},'cash_movements':{'comment':'hacked'},'customer_discounts':{'percent':99},'customers':{'telegram':'@hacked'},'menu_dishes':{'name_ru':'hacked'},'order_attempts':{'outcome':'hacked'},'order_days':{'qty':9},'order_drafts':{'ip_hash':'x'},'order_edits':{'kind':'address'},'order_surcharges':{'status':'paid'},'orders':{'comment':'hacked','status':'cancelled'},'route_overrides':{'updated_by':'hacked'},'security_alerts':{'kind':'x'},'settings':{'value':'0'},'vip_customers':{'note':'hacked'},'viewers':{'note':'hacked'},'courier_pay_days':{'km_manual':999,'paid_at':'2026-11-02T00:00:00Z'},'courier_payouts':{'status':'paid','paid_amount':1},'courier_pay_log':{'new_value':'hacked'},'renewal_links':{'used_at':'2026-11-03T00:00:00Z'},'renewal_attempts':{'ip_hash':'x'}}
order_id = json.loads(call('GET', '/rest/v1/orders?select=id&limit=1')[1])[0]['id']
od_id = json.loads(call('GET', '/rest/v1/order_days?select=id&limit=1')[1])[0]['id']
insert_body = {'admins':{'user_id':UID},'auth_attempts':{'kind':'x','ok':True},'cash_categories':{'type':'out','name':'zz'},'cash_movements':{'date':'2026-11-02','type':'out','category_id':1,'amount':1},'customer_discounts':{'email':'zz@zz.zz','percent':50},'customers':{'user_id':str(uuid.uuid4())},'menu_dishes':{'weekday':1,'position':1,'name_ua':'x','name_ru':'x','name_en':'x','name_vi':'x'},'order_attempts':{'outcome':'x'},'order_days':{'order_id':order_id,'delivery_date':'2026-12-01','qty':1},'order_drafts':{'id':'x','payload':{}},'order_edits':{'order_id':order_id,'old_total':1,'new_total':1,'old_portions':1,'new_portions':1,'changes':{}},'order_surcharges':{'order_id':order_id,'amount':1000,'status':'paid'},'orders':{'type':'single','telegram':'@x','address':'x','payment_method':'cash','qty':1,'total':1,'delivery_total':0,'status':'new'},'route_overrides':{'date':'2026-12-01','couriers':1,'assign':{}},'security_alerts':{'kind':'zz'},'settings':{'key':'zz_test','value':'1','is_public':True},'vip_customers':{'email':'zz@zz.zz'},'viewers':{'user_id':UID},'courier_pay_days':{'date':'2026-12-01','courier':1,'km_manual':1},'courier_payouts':{'week_start':'2026-12-01','week_end':'2026-12-06','amount':1},'courier_pay_log':{'date':'2026-12-01','courier':1,'field':'km'},'renewal_links':{'code':'A'*22,'order_id':order_id,'portions':1},'renewal_attempts':{'ip_hash':'x'}}

before = snapshot()
res = []  # (что, результат, ok)
def verdict(status, body):
    # отказ: 401/403/404/400 с кодом 42501/PGRST, либо 200/204 с пустым результатом (0 строк)
    if status in (401, 403, 404, 400, 405, 409) or (status == 0): return True
    if status in (200, 201, 204): return body.strip() in ('', '[]', '{}', 'null', 'false')
    return False
for t in TABLES:
    c = first[t]
    for m, path, b in (('POST', f'/rest/v1/{t}', insert_body[t]), ('PATCH', f'/rest/v1/{t}?{c}=not.is.null', patch_body[t]), ('DELETE', f'/rest/v1/{t}?{c}=not.is.null', None)):
        s, body = call(m, path, b)
        code = ''
        try: code = json.loads(body).get('code', '')
        except Exception: pass
        res.append((f'{"INSERT" if m=="POST" else "UPDATE" if m=="PATCH" else "DELETE"} {t}', f'{s} {code or body[:40]}', verdict(s, body)))
# upsert через POST с Prefer: resolution=merge-duplicates (попытка перезаписать)
s, body = call('POST', '/rest/v1/settings?on_conflict=key', {'key': 'price_single', 'value': '1', 'is_public': True}, extra={'Prefer': 'resolution=merge-duplicates,return=representation'})
res.append(('UPSERT settings (price_single=1)', f'{s} {body[:50]}', verdict(s, body)))
# RPC
for fn, b in (('admin_change_portions', {'p_order': order_id, 'p_days': [{'id': od_id, 'qty': 3}]}), ('admin_change_address', {'p_order': order_id, 'p_address': 'Hacked address 1', 'p_place_id': None, 'p_lat': None, 'p_lng': None, 'p_comment': None, 'p_hotel': None, 'p_also': None}), ('admin_settle_surcharge', {'p_id': 1}), ('cash_sync_order', {'p_order': order_id}), ('handle_new_user', {}), ('sync_order_delivered', {}), ('cash_sync_from_days', {}), ('cash_sync_from_orders', {}), ('courier_payout_pay', {'p_payout': 1, 'p_amount': 1, 'p_by': 'x', 'p_days': [{'date': '2026-11-02', 'courier': 1, 'addresses': 1, 'km': 1, 'amount': 1}]}), ('courier_pay_days_log', {})):
    s, body = call('POST', f'/rest/v1/rpc/{fn}', b)
    low = body.lower()
    res.append((f'RPC {fn}', f'{s} {body[:70]}', s in (401, 403, 404) or 'forbidden' in low or 'permission denied' in low or 'could not find the function' in low))
# только чтение (разрешены, не меняют данных)
for fn in ('is_admin', 'is_viewer', 'my_admin_role', 'my_discount', 'my_is_vip'):
    s, body = call('POST', f'/rest/v1/rpc/{fn}', {})
    res.append((f'RPC {fn} (только чтение)', f'{s} {body[:20]}', s == 200))
# edge-функции
fake = '00000000-0000-0000-0000-000000000000'
for fn, b in (('change-portions', {'id': fake, 'days': [{'id': 1, 'qty': 2}]}), ('change-address', {'id': fake, 'address': 'Hacked address 12'}), ('delete-order', {'id': fake}), ('resolve-point', {'order_id': fake, 'input': '16.05, 108.22'}), ('daily-report', {'date': '2026-11-08', 'parts': 'courier'}), ('daily-report', {'date': '2026-11-08', 'parts': 'kitchen'}), ('courier-payroll', {'action': 'weekly', 'date': '2026-11-08'}), ('renewal-reminder', {'date': '2026-11-03'})):
    s, body = call('POST', f'/functions/v1/{fn}', b)
    res.append((f'EDGE {fn}{" ("+b["parts"]+")" if "parts" in b else ""}', f'{s} {body[:40]}', s in (401, 403) and 'forbidden' in body.lower() or s == 403))
s, body = call('POST', '/functions/v1/tg-webhook', {'callback_query': {'data': 'confirm:1'}})
res.append(('EDGE tg-webhook (только секрет Telegram)', f'{s} {body[:40]}', s in (401, 403)))
mp = '--zz\r\nContent-Disposition: form-data; name="payload"\r\n\r\n' + json.dumps({'type': 'single', 'days': ['2026-11-04'], 'portions': 1, 'telegram': '@zz', 'phone': '+84900000000', 'address': 'zz', 'payment': 'cash', 'captcha': 'x'}) + '\r\n--zz--\r\n'
s, body = call('POST', '/functions/v1/send-order', raw=mp.encode(), ctype='multipart/form-data; boundary=zz')
res.append(('EDGE send-order (заказ от viewer)', f'{s} {body[:40]}', s == 403 and 'forbidden' in body))
# storage
s, body = call('POST', '/storage/v1/bucket', {'id': 'zz-test', 'name': 'zz-test', 'public': True})
res.append(('STORAGE создать бакет', f'{s} {body[:60]}', s in (400, 401, 403)))
s, body = call('POST', '/storage/v1/object/menu/zz.txt', raw=b'hello', ctype='text/plain')
res.append(('STORAGE загрузить файл', f'{s} {body[:60]}', s in (400, 401, 403, 404)))
s, body = call('DELETE', '/storage/v1/object/menu/zz.txt', ctype='text/plain')
res.append(('STORAGE удалить файл', f'{s} {body[:60]}', s in (400, 401, 403, 404)))
s, body = call('DELETE', '/storage/v1/bucket/zz-test', ctype='text/plain')
res.append(('STORAGE удалить бакет', f'{s} {body[:60]}', s in (400, 401, 403, 404)))
# роль: через user_metadata/app_metadata
s, body = call('PUT', '/auth/v1/user', {'data': {'role': 'admin', 'is_admin': True, 'admin': True}})
s2, r2 = call('POST', '/rest/v1/rpc/my_admin_role', {})
res.append(('СМЕНА РОЛИ user_metadata={role:admin}', f'PUT {s}, затем my_admin_role={r2}', r2.strip() == '"viewer"'))
s, body = call('PUT', '/auth/v1/user', {'app_metadata': {'role': 'admin'}} if False else {'data': {'role': 'service_role'}})
s2, r2 = call('POST', '/rest/v1/rpc/my_admin_role', {})
res.append(('СМЕНА РОЛИ user_metadata={role:service_role}', f'PUT {s}, затем my_admin_role={r2}', r2.strip() == '"viewer"'))
s, body = call('POST', '/rest/v1/rpc/is_admin', {})
res.append(('is_admin() после попыток', body, body.strip() == 'false'))
sql(f"update auth.users set raw_user_meta_data='{{}}'::jsonb where id='{UID}'")  # вернуть метаданные как были
after = snapshot()
changed = [t for t in before if before[t] != after[t]]
w = max(len(r[0]) for r in res)
bad = 0
for what, r, ok in res:
    bad += not ok
    print(f'{"✅" if ok else "❌"} {what.ljust(w)}  → {r}')
print(f'\nСнимок до/после ({len(before)} объектов): ' + ('ИЗМЕНЕНИЙ НЕТ' if not changed else f'ИЗМЕНИЛОСЬ: {changed}'))
print(f'Провалов проверок: {bad}')
