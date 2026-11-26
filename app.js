const byId = id => document.getElementById(id);
const area = byId('area'), form = byId('form'), dialog = byId('dialog');
const storeKey = 'utilisync.requests.v1';
let records = structuredClone(seedRequests);
let saved;
try {
  saved = localStorage.getItem(storeKey);
} catch {
  showNotice('Browser storage is unavailable. Changes will last for this session only.');
}
if (saved != null) {
  try { records = parseRequests(saved); }
  catch { showNotice('Saved requests could not be loaded. Sample requests are shown; saving a change will replace the unreadable data.'); }
}
const visible = new Set(Object.keys(utilities));
let selected = '';
function element(tag, text, parent) {
  const el=document.createElement(tag);
  el.textContent=text;
  parent.append(el);
  return el;
}
function action(parent,label,fn,key) {
  const button=element('button',label,parent);
  button.type='button';
  button.onclick=fn;
  if (key) {
    button.dataset.focusKey = key;
    button.setAttribute('aria-pressed', selected === key);
  }
}
function showNotice(message) {
  const notice = byId('notice');
  notice.textContent = message;
  notice.hidden = !message;
}
function save() {
  try {
    localStorage.setItem(storeKey,JSON.stringify(records));
    showNotice('');
  } catch { showNotice('Changes are available for this session only. Browser storage is unavailable.'); }
}
function select(value) { selected=value; render(); }
function render() {
  const roads=areas[area.value];
  byId('title').textContent=area.value;
  drawMap(byId('map'),roads,visible,selected,select);
  const results=byId('results'), details=byId('details');
  const focusedResult = results.contains(document.activeElement)
    ? document.activeElement.dataset.focusKey : null;
  results.replaceChildren();
  details.replaceChildren();
  const query=byId('search').value.trim().toLowerCase();
  const local=records.filter(r=>r.area===area.value);
  const matches=text=>text.toLowerCase().includes(query);
  for(const [name] of roads) if(matches(name)) action(results,name,()=>select(name),name);
  for(const r of local) if(matches(r.id+' '+r.purpose)) action(results,r.id+' · '+r.purpose+' · '+r.status,()=>select(r.id),r.id);
  if (focusedResult) {
    Array.from(results.children).find(button => button.dataset.focusKey === focusedResult)?.focus({preventScroll:true});
  }
  if(!results.children.length) element('p','No matching streets or requests.',results);
  const road=roads.find(row=>row[0]===selected);
  if(road) {
    const [name,,types,confidence,date]=road;
    element('small','STREET RECORD',details);
    element('h2',name,details);
    element('p','Utilities: '+types.map(t=>utilities[t].label).join(', ')+' · Data confidence: '+confidence,details);
    element('p',date?'Last resurfaced on '+date:'No resurfacing recorded.',details);
    for(const r of local.filter(r=>r.streets.includes(name))) action(details,r.id+' · '+r.status,()=>{
      select(r.id);
      details.focus({preventScroll:true});
    });
  }
  const r=local.find(item=>item.id===selected);
  if(!r) return;
  element('small',r.id+' · '+r.status,details);
  element('h2',r.purpose,details);
  element('p',r.streets.join(', ')+' · '+r.start+' to '+r.end,details);
  if(r.reason) element('p','Rejection reason: '+r.reason,details);
  if (r.status !== 'Rejected') {
    const messages = conflicts(r.area, r.streets, r.start, r.end, records, r.id);
    if (messages.length) {
      element('h3','Conflict warnings',details);
      const warnings = element('ul','',details);
      warnings.className = 'warnings';
      for (const message of messages) element('li',message,warnings);
    }
  }
  if(r.status==='Submitted' && byId('role').value==='Coordinator') {
    action(details,'Approve',()=>{r.status='Approved'; save(); render(); details.focus({preventScroll:true});});
    action(details,'Reject',()=>{
      const reason=prompt('Why is this request being rejected?');
      if(reason===null) return;
      if(!reason.trim()) {alert('Enter a reason to reject the request.');return;}
      r.reason=reason.trim(); r.status='Rejected'; save(); render(); details.focus({preventScroll:true});
    });
  }
}
for(const name of Object.keys(areas)) area.add(new Option(name,name));
area.value=initialArea;
for(const [type,style] of Object.entries(utilities)) {
  const label=element('label','',byId('layers'));
  const box=element('input','',label);
  box.type='checkbox'; box.checked=true;
  const sample=element('i','',label);
  sample.style.borderTop='3px '+({water:'solid',power:'dashed',fibre:'dotted'}[type] || 'solid')+' '+style.color;
  label.append(style.label);
  box.onchange=()=>{if(box.checked) visible.add(type); else visible.delete(type);render();};
}
function changeArea() {byId('search').value='';select(areas[area.value][0][0]);}
area.onchange=changeArea;
byId('search').oninput=render;
byId('role').onchange=render;
byId('new').onclick=()=>{
  form.reset();
  byId('choices').replaceChildren();
  for(const [name] of areas[area.value]) {
    const label=element('label','',byId('choices'));
    const box=element('input','',label);
    box.type='checkbox'; box.name='street'; box.value=name; box.checked=name===selected;
    label.append(' '+name);
  }
  updateForm(); dialog.showModal();
};
function updateForm() {
  const data=new FormData(form), streets=data.getAll('street');
  const start=data.get('start'), end=data.get('end');
  byId('choices').querySelector('input').setCustomValidity(streets.length?'':'Select at least one street.');
  form.elements.end.min=start;
  const purpose = data.get('purpose').trim();
  form.elements.purpose.setCustomValidity(!purpose ? 'Enter a purpose.' : purpose.length > 120 ? 'Use at most 120 characters.' : '');
  form.elements.start.setCustomValidity(start && !isValidDate(start) ? 'Enter a valid date between years 0001 and 9999.' : '');
  form.elements.end.setCustomValidity(end && !isValidDate(end) ? 'Enter a valid date between years 0001 and 9999.' : start && end && end < start ? 'End date must be on or after the start date.' : '');
  byId('warnings').textContent=conflicts(area.value,streets,start,end,records).join(' ');
}
// Validate after refreshing dependent constraints, including programmatic edits.
form.noValidate=true;
form.oninput=updateForm;
byId('cancel').onclick=()=>dialog.close();
form.onsubmit=e=>{
  e.preventDefault();
  updateForm();
  if (!form.reportValidity()) return;
  const data=new FormData(form);
  const id=nextRequestId(records);
  records.push({id,area:area.value,streets:data.getAll('street'),purpose:data.get('purpose').trim(),start:data.get('start'),end:data.get('end'),status:'Submitted'});
  save(); dialog.close(); byId('search').value=''; select(id);
};
byId('reset').onclick=()=>{
  if(confirm('Replace saved requests in both demo areas with the original samples?')) {
    records=structuredClone(seedRequests);save();changeArea();
  }
};
changeArea();
