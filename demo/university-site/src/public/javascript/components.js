
(function(){


  xtag.create('x-views', class extends XTagElement {
    set 'view::attr' (name){
      console.log(name);
      Array.from(this.children).forEach(view => view.removeAttribute('active'));
      var view = this.querySelector('x-view[name="'+ name +'"]');
      if (view) {
        view.setAttribute('active', '');
        xtag.fireEvent(view, 'viewchange', { detail: name });
      }
    }
  });
  

  function getPanels(trigger){
    var selector = trigger.getAttribute('flexcordion-trigger');
    return selector ? trigger.parentNode.querySelectorAll(selector) : trigger.nextElementSibling ? [trigger.nextElementSibling] : [];
  }

xtag.create('x-flexcordion', class extends XTagElement {
  constructor(){
    super();
    Array.prototype.some.call(this.querySelectorAll('[flexcordion-open]'), panel => {
      if (panel.parentNode == this) {
        panel.removeAttribute('flexcordion-open');
        this.openPanel(panel, true);
        return true;
      }
    })
  }
  openPanel(panel, nofx){
    if (!panel.hasAttribute('flexcordion-open')) {
      panel.setAttribute('flexcordion-open', '')
      panel.style.height = nofx ? 'auto' : panel.scrollHeight + 'px';
    }
  }
  closePanel(panel, nofx){
    if (panel.hasAttribute('flexcordion-open')) {
      panel.style.height = panel.scrollHeight + 'px';
      panel.removeAttribute('flexcordion-open')
      if (!nofx) var height = panel.offsetHeight;
      panel.style.height = '';
    }
  }
  togglePanel(panel, nofx){
    if (panel.hasAttribute('flexcordion-open')) this.closePanel(panel, nofx);
    else this.openPanel(panel, nofx);
  }
  removeItem(trigger){
    getPanels(trigger).forEach(function(panel) {
      panel.remove()
    });
    trigger.remove();
  }
  'tap::event:delegate([flexcordion-trigger])' (e){
    if (this.parentNode === e.currentTarget) {
      getPanels(this).forEach(panel => e.currentTarget.togglePanel(panel));
    }
  }
  'transitionend::event:delegate(section)' (e){
    if (this.parentNode === e.currentTarget && this.hasAttribute('flexcordion-open')) {
      this.style.height = 'auto';
      xtag.fireEvent(this, 'panelopen');
    }
  }
});

})();

(function(){

  xtag.create('x-modal', class extends XTagElement {
    set 'active::attr(boolean)' (val){
      val ? this.open() : this.close();
    }
    open(){
      this.active = true;
    }
    close(){
      if (this.active) {
        this.active = false;
        this.setAttribute('closing', '');
      }
    }
    'tap::event:delegate([close-action~="tap"])' (e){
      if (this == e.target) this.close();
    }
    'transitionend::event' (e){
      if (this == e.target && !this.active) {
        this.removeAttribute('closing');
      }
    }
  });

})();

(function(){

  xtag.create('x-notifier', class extends XTagElement {
    set 'unread::attr' (val){
      
    }
    show (title, obj = {}){
      var notice = document.createElement('figure');
      if (obj.duration !== false) notice.setAttribute('duration', obj.duration || 3000);
      if (obj.type !== false) notice.setAttribute('type', obj.type);
      if (obj.hide) notice.setAttribute('hide', obj.hide);
      notice.innerHTML = `<header>${title}</header><p>${obj.body || ''}</p>`;
      this.appendChild(notice);
      requestAnimationFrame(() => requestAnimationFrame(() => notice.setAttribute('showing', '')));
    }
    hide (notice, when){
      if (notice.hasAttribute('showing')) {
        if (notice.dataset.timeout) clearTimeout(notice.dataset.timeout);
        notice.dataset.timeout = setTimeout(() => notice.removeAttribute('showing'), Number(when || 0));
      }
      else if (notice.parentNode) notice.parentNode.removeChild(notice);
    }
    'transitionend::event:delegate(x-notifier > figure)' (e){
      e.currentTarget.hide(this, this.getAttribute('duration'));
    }
    'click::event:delegate(x-notifier > figure[hide~="tap"])' (e){
      e.currentTarget.hide(this);
    }
  });

});

(function(){

  xtag.create('x-action', class extends XTagElement {
    get 'action::attr' (){}
    'click::event' (e){
      if (this.action) xtag.fireEvent(this, 'action', {detail: this.action });
    }
  });

});