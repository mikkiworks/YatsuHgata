window.initNewsCalendar = async () => {
 const params = new URLSearchParams(location.search);
 if (params.get('category') !== 'event') return;
 const content = document.querySelector('.content');
 const list = content?.querySelector('.news__list');
 if (!list) return;
 const pagination = content.querySelector('.news-pagination');
 const toolbar = document.createElement('div');
 toolbar.className = 'news-view-tools';
 const icon = listView => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${listView ? '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>' : '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M7 14h3M14 14h3M7 18h3"/>'}</svg>`;
 const toggle = document.createElement('button');
 toggle.type = 'button';
 toggle.className = 'news-view-toggle';
 toggle.innerHTML = icon(false) + '<span>カレンダーで見る</span>';
 toggle.setAttribute('aria-expanded', 'false');
 toggle.setAttribute('aria-controls', 'news-calendar');
 toolbar.append(toggle);
 content.before(toolbar);
 const panel = document.createElement('section');
 panel.id = 'news-calendar';
 panel.className = 'news-calendar';
 panel.setAttribute('aria-label', 'イベントカレンダー');
 panel.hidden = true;
 content.prepend(panel);
 let events;
 let calendar = false;
 const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
 let selected = today;
 let month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : today.slice(0,7);
 const key = date => date.toISOString().slice(0,10);
 const dateFor = (value, day = 1) => new Date(`${value}-${String(day).padStart(2,'0')}T00:00:00Z`);
 const onDate = date => events.filter(event => event.calendar !== 'period' && event.start <= date && event.end >= date && !event.exclude.includes(date));
 const updateUrl = () => {
  const url = new URL(location.href);
  if (calendar) { url.searchParams.set('view', 'calendar'); url.searchParams.set('month', month); }
  else { url.searchParams.delete('view'); url.searchParams.delete('month'); }
  history.replaceState(null, '', url);
 };
 function render() {
  panel.replaceChildren();
  const controls = document.createElement('div');
  controls.className = 'news-calendar__controls';
  const heading = document.createElement('h2');
  heading.id = 'calendar-month-title';
  heading.setAttribute('aria-live', 'polite');
  heading.textContent = `${month.slice(0,4)}年${Number(month.slice(5))}月`;
  function move(label, delta) {
   const button = document.createElement('button');
   button.type = 'button'; button.textContent = label;
   button.addEventListener('click', () => {
    const date = dateFor(month); date.setUTCMonth(date.getUTCMonth()+delta);
    month = key(date).slice(0,7); selected = month === today.slice(0,7) ? today : `${month}-01`;
    render(); updateUrl();
    panel.querySelector(delta < 0 ? '[data-prev]' : '[data-next]').focus();
   });
   button.setAttribute(delta < 0 ? 'data-prev' : 'data-next', '');
   return button;
  }
  controls.append(move('前月', -1), heading, move('翌月', 1));
  const current = document.createElement('button');
  current.type = 'button'; current.textContent = '今月';
  current.addEventListener('click', () => { month=today.slice(0,7);selected=today;render();updateUrl();panel.querySelector('[data-current]').focus(); });
  current.dataset.current = '';
  controls.append(current);
  const help = document.createElement('p');
  help.className = 'news-calendar__help';
  help.textContent = '件数のある日付を選ぶと、その日のイベントを表示します。期間開催・応募受付は下にまとめています。';
  const table = document.createElement('table');
  table.className = 'news-calendar__table'; table.setAttribute('aria-labelledby', heading.id);
  const head = table.createTHead().insertRow();
  for (const day of ['日','月','火','水','木','金','土']) {
   const th = document.createElement('th'); th.scope = 'col'; th.textContent=day; head.append(th);
  }
  const body = table.createTBody();
  const start = dateFor(month).getUTCDay();
  const last = dateFor(month); last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  const days = last.getUTCDate();
  for (let slot=0; slot<Math.ceil((start+days)/7)*7; slot++) {
   if (slot%7===0) body.insertRow();
   const cell = body.rows[body.rows.length-1].insertCell();
   const day = slot-start+1;
   if (day<1 || day>days) continue;
   const date = key(dateFor(month, day)); const count=onDate(date).length;
   const button=document.createElement('button');button.type='button';button.dataset.date=date;
   button.setAttribute('aria-label', `${Number(month.slice(5))}月${day}日、イベント${count}件`);
   button.setAttribute('aria-pressed', String(date===selected));
   if (date===today) button.setAttribute('aria-current','date');
   button.innerHTML=`<span>${day}</span>${count ? `<small>${count}件</small>` : ''}`;
   if(count) button.classList.add('has-events');
   button.addEventListener('click',()=>{ selected=date; render();panel.querySelector(`[data-date="${date}"]`).focus(); });
   cell.append(button);
  }
  const details=document.createElement('div');details.className='news-calendar__details';details.setAttribute('aria-live','polite');
  const title=document.createElement('h3');title.textContent=`${Number(selected.slice(5,7))}月${Number(selected.slice(8))}日のイベント`;
  details.append(title);
  const matches=onDate(selected);
  if(!matches.length){const p=document.createElement('p');p.textContent='この日に掲載されているイベントはありません。';details.append(p);}
  else {
   const ul=document.createElement('ul');
   for(const event of matches){
    const li=document.createElement('li');const a=document.createElement('a');
    a.href=new URL(event.href,new URL('./',location.href)).href;a.textContent=event.title;
    li.append(a);ul.append(li);
   }
   details.append(ul);
   const note=document.createElement('p');note.className='news-calendar__help';note.textContent='時間・参加方法・開催変更については各記事をご確認ください。';details.append(note);
  }
  panel.append(controls,help,table,details);
  const monthStart = `${month}-01`;
  const monthEnd = key(last);
  const periods = events.filter(event => event.calendar === 'period' && event.start <= monthEnd && event.end >= monthStart);
  const section = document.createElement('section');
  section.className = 'news-calendar__periods';
  const periodHeading = document.createElement('h3');
  periodHeading.textContent = '今月の期間開催・応募受付';
  section.append(periodHeading);
  if (!periods.length) {
   const empty = document.createElement('p');empty.textContent = 'この月の期間開催・応募受付はありません。';section.append(empty);
  } else {
   const ul = document.createElement('ul');
   for (const event of periods.sort((a,b) => a.start.localeCompare(b.start))) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = new URL(event.href, new URL('./', location.href)).href;a.textContent = event.title;
    const dates = document.createElement('p');dates.className = 'news-calendar__help';
    const label = value => `${Number(value.slice(0,4))}年${Number(value.slice(5,7))}月${Number(value.slice(8))}日`;
    dates.textContent = `${label(event.start)}〜${label(event.end)}`;
    if(event.exclude.length) dates.textContent += `（実施しない日：${event.exclude.map(label).join('、')}）`;
    li.append(a, dates);ul.append(li);
   }
   section.append(ul);
  }
  panel.append(section);
 }
 async function show(value) {
  toggle.disabled=true;
  try {
   if(value && !events){
    const response=await fetch(new URL('../assets/data/events.json',location.href));
    if(!response.ok) throw new Error('読み込み失敗');
    events=await response.json();
    if(!Array.isArray(events)) throw new Error('形式エラー');
    if(!selected.startsWith(month) || !onDate(selected).length){
     const first=events.filter(event=>event.calendar !== 'period').flatMap(event=>[event.start]).filter(date=>date.startsWith(month)).sort()[0];
     selected=first || `${month}-01`;
    }
   }
   calendar=value;panel.hidden=!value;list.hidden=value;if(pagination) pagination.hidden=value;
   toggle.setAttribute('aria-expanded',String(value));
   toggle.innerHTML=icon(value)+`<span>${value ? 'リストで見る' : 'カレンダーで見る'}</span>`;
   toolbar.querySelector('[role="alert"]')?.remove();
   if(value) render();updateUrl();
  } catch {
   let error=toolbar.querySelector('[role="alert"]');
   if(!error){error=document.createElement('p');error.setAttribute('role','alert');toolbar.append(error);}
   error.textContent='カレンダーを読み込めませんでした。もう一度お試しください。';
  } finally {toggle.disabled=false;}
 }
 toggle.addEventListener('click',()=>show(!calendar));
 if(params.get('view')==='calendar') await show(true);
};
