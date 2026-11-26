function drawMap(svg, roads, visible, selected, selectRoad) {
  const focusedRoad = svg.contains(document.activeElement)
    ? document.activeElement.getAttribute('aria-label') : null;
  svg.replaceChildren();
  function add(tag, attrs, parent=svg) {
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
    parent.append(el);
    return el;
  }
  for(const [name,points,types] of roads) {
    const group=add('g',{tabindex:0,role:'button','aria-label':name,'aria-pressed':selected===name});
    group.onclick=()=>selectRoad(name);
    group.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectRoad(name);}};
    add('polyline',{points,stroke:selected===name?'#7d9c88':'#b5c1b7','stroke-width':21,fill:'none'},group);
    add('polyline',{points,stroke:'#fafbf6','stroke-width':16,fill:'none'},group);
    types.forEach((type,i)=>{
      if(visible.has(type)) add('polyline',{points,fill:'none',stroke:utilities[type].color,'stroke-width':3,'stroke-dasharray':utilities[type].dash,transform:'translate(0 '+(i*5-2)+')'},group);
    });
    const [x,y]=points.split(' ')[0].split(',').map(Number);
    add('text',{x,y:y-17},group).textContent=name;
    if (name === focusedRoad) group.focus({preventScroll:true});
  }
}
