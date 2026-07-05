class NanoGrid {
  constructor(elementOrSelector, config) {
    this.table = typeof elementOrSelector === 'string' ? document.querySelector(elementOrSelector) : elementOrSelector;

    if (!this.table) {
      console.error('NanoGrid Initialization Error: Target table element not found.');
      return;
    }
    
    this.config = Object.assign({
      data: [],
      serverSide: false,
      ajax: null,
      pageSize: 10,
      pageSizeOptions: [10, 25, 50, 100], 
      searchable: true,
      exportable: true, 
      columnDefs: {},
      checkboxes: false,         
      rowIdField: 'id',          
      fontSize: '0.875rem',      
      processingText: 'Loading...',
      emptyText: 'Record not found',
      theme: 'light', 
      rowExpansion: null,
      responsive: true 
    }, config);

    this.buildDOMStructure();
    this.applyTheme();

    if (this.config.checkboxes && !this.table.querySelector('th[data-checkbox]')) {
      const thCb = document.createElement('th');
      thCb.setAttribute('data-checkbox', 'true');
      thCb.innerHTML = `<input type="checkbox" class="ng-select-all" aria-label="Select All" />`;
      thCb.style.width = '40px';
      this.table.querySelector('thead tr').insertAdjacentElement('afterbegin', thCb);
    }
    
    if ((this.config.rowExpansion || this.config.responsive) && !this.table.querySelector('th[data-expand]')) {
      const thExp = document.createElement('th');
      thExp.setAttribute('data-expand', 'true');
      thExp.style.width = '30px';
      this.table.querySelector('thead tr').insertAdjacentElement('afterbegin', thExp);
    }

    this.columns = Array.from(this.table.querySelectorAll('thead th')).map((th, index) => {
      const field = th.getAttribute('data-field');
      const isAction = field === 'actions';
      const isCheckbox = th.getAttribute('data-checkbox') === 'true';
      const isExpand = th.getAttribute('data-expand') === 'true';
      const sortable = th.getAttribute('data-sortable') !== 'false' && !isAction && !isCheckbox && !isExpand && !!field;
      const filterable = th.getAttribute('data-filter') === 'true' && !!field;
      const sticky = th.getAttribute('data-sticky'); 
      
      let isSearchable = false;
      if (Array.isArray(this.config.searchable)) {
        isSearchable = this.config.searchable.includes(index) && !isAction && !isCheckbox && !isExpand && !!field;
      } else if (this.config.searchable === true) {
        isSearchable = th.getAttribute('data-searchable') !== 'false' && !isAction && !isCheckbox && !isExpand && !!field;
      }

      if (sortable) th.classList.add('ng-sortable');
      if (sticky) {
        th.classList.add(`ng-sticky-${sticky}`);
        th.style.position = 'sticky';
        th.style[sticky] = '0';
        th.style.zIndex = '10';
      }

      if (filterable) {
        th.insertAdjacentHTML('beforeend', `<input type="text" class="ng-col-filter" data-col="${field}" placeholder="Filter..." onclick="event.stopPropagation()">`);
      }

      const headerText = th.textContent ? th.textContent.trim() : '';

      return { field, title: headerText, element: th, sortable, searchable: isSearchable, isCheckbox, isExpand, filterable, sticky, hidden: false, responsiveHidden: false, index };
    });

    this.state = {
      data: this.config.serverSide ? [] : [...this.config.data],
      filteredData: this.config.serverSide ? [] : [...this.config.data],
      page: 1,
      pageSize: this.config.pageSize,
      search: "",
      colFilters: {}, 
      sortCol: null,
      sortDir: 'asc',
      totalRecords: 0,
      selected: new Set(),
      expanded: new Set() 
    };

    this.injectStyles(); 
    this.init();
  }

  applyTheme() {
    let isDark = this.config.theme === 'dark';
    if (this.config.theme === 'auto') {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    if (isDark) this.container.classList.add('ng-dark');
    else this.container.classList.remove('ng-dark');
  }

  buildDOMStructure() {
    this.container = document.createElement('div');
    this.container.className = 'nanogrid-container';
    this.container.style.setProperty('--ng-text-size', this.config.fontSize);

    this.tableWrapper = document.createElement('div');
    this.tableWrapper.className = 'nanogrid-table-wrapper';
    
    this.overlay = document.createElement('div');
    this.overlay.className = 'ng-loader-overlay';
    this.overlay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--ng-accent);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: ng-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
        <span style="font-weight: 600;">${this.config.processingText}</span>
      </div>
    `;

    this.table.parentNode.insertBefore(this.container, this.table);
    
    this.tableWrapper.appendChild(this.table);
    this.tableWrapper.appendChild(this.overlay); 
    this.container.appendChild(this.tableWrapper);
    
    this.table.classList.add('nanogrid-table');
  }

  injectStyles() {
    if (document.getElementById('nanogrid-theme-styles')) return;

    const style = document.createElement('style');
    style.id = 'nanogrid-theme-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');

      :root {
        --ng-bg: #ffffff; 
        --ng-surface: #f8fafc; 
        --ng-border: #e2e8f0; 
        --ng-text-main: #334155; 
        --ng-text-dark: #0f172a; 
        --ng-text-muted: #64748b; 
        --ng-accent: #007bff; 
        --ng-accent-ring: rgba(0, 123, 255, 0.15); 
        --ng-radius: 8px; 
        --ng-radius-sm: 6px; 
        --ng-font: 'Plus Jakarta Sans', sans-serif;
      }
      
      .ng-dark {
        --ng-bg: #343a40; 
        --ng-surface: #454d55; 
        --ng-border: #4f5962; 
        --ng-text-main: #e2e8f0; 
        --ng-text-dark: #f8fafc; 
        --ng-text-muted: #adb5bd; 
        --ng-accent: #3b82f6; 
        --ng-accent-ring: rgba(59, 130, 246, 0.2);
      }

      .nanogrid-container { font-family: var(--ng-font); color: var(--ng-text-main); width: 100%; display: flex; flex-direction: column; gap: 1rem; }
      .nanogrid-top-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
      .nanogrid-top-left, .nanogrid-top-right { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
      .nanogrid-top-left { flex: 1; } .nanogrid-top-right { justify-content: flex-end; }
      
      .nanogrid-search-wrapper { position: relative; min-width: 250px; flex-grow: 0; }
      .nanogrid-search-icon { position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--ng-text-muted); }
      .nanogrid-search { width: 100%; padding: 0.45rem 1rem 0.45rem 2.2rem; font-size: var(--ng-text-size); font-family: inherit; color: var(--ng-text-dark); background: var(--ng-bg); border: 1px solid var(--ng-border); border-radius: var(--ng-radius-sm); outline: none; transition: all 0.2s; box-sizing: border-box; }
      .nanogrid-search:focus, .ng-col-filter:focus { border-color: var(--ng-accent); box-shadow: 0 0 0 3px var(--ng-accent-ring); }
      
      .ng-dropdown { position: relative; display: inline-block; user-select: none; }
      .ng-dropdown-label { font-size: var(--ng-text-size); color: var(--ng-text-muted); font-weight: 500; }
      .ng-dropdown-btn { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.45rem 0.875rem; font-size: var(--ng-text-size); font-family: inherit; font-weight: 600; color: var(--ng-text-dark); background: var(--ng-bg); border: 1px solid var(--ng-border); border-radius: var(--ng-radius-sm); cursor: pointer; transition: all 0.2s; min-width: max-content; }
      .ng-dropdown-btn:hover { background: var(--ng-surface); }
      .ng-dropdown-btn.active { border-color: var(--ng-accent); box-shadow: 0 0 0 3px var(--ng-accent-ring); }
      .ng-dropdown-icon { width: 14px; height: 14px; color: var(--ng-text-muted); transition: transform 0.2s; }
      .ng-dropdown-btn.active .ng-dropdown-icon.rotate { transform: rotate(180deg); color: var(--ng-accent); }
      
      .ng-dropdown-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 100%; background: var(--ng-bg); border: 1px solid var(--ng-border); border-radius: var(--ng-radius-sm); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); z-index: 100; opacity: 0; visibility: hidden; transform: translateY(-5px); transition: all 0.2s ease; overflow: hidden; padding: 0.35rem; display: flex; flex-direction: column; gap: 0.15rem; max-height: 300px; overflow-y: auto;}
      .ng-dropdown-menu.open { opacity: 1; visibility: visible; transform: translateY(0); }
      .ng-dropdown-menu.left-align { right: auto; left: 0; } 
      .ng-dropdown-item { padding: 0.45rem 0.75rem; font-size: var(--ng-text-size); font-weight: 500; color: var(--ng-text-main); border-radius: 6px; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 0.5rem; }
      .ng-dropdown-item:hover { background: var(--ng-surface); color: var(--ng-text-dark); }
      .ng-dropdown-item.selected { background: var(--ng-accent-ring); color: var(--ng-accent); }

      .nanogrid-table-wrapper { position: relative; overflow-x: auto; overflow-y: hidden; background: var(--ng-bg); border: 1px solid var(--ng-border); border-radius: var(--ng-radius); -webkit-overflow-scrolling: touch; }
      
      .ng-loader-overlay { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; z-index: 50; opacity: 0; visibility: hidden; transition: all 0.2s ease; }
      .ng-dark .ng-loader-overlay { background: rgba(52, 58, 64, 0.9); }
      .nanogrid-table-wrapper.is-loading .ng-loader-overlay { opacity: 1; visibility: visible; }
      .nanogrid-table-wrapper.is-loading .nanogrid-table { pointer-events: none; user-select: none; }

      .nanogrid-table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--ng-text-size); min-width: max-content; }
      .nanogrid-table, .nanogrid-table.table-bordered { border: none !important; margin-bottom: 0 !important; }
      .nanogrid-table th { padding: 0.875rem 1.25rem; font-weight: 600; color: var(--ng-text-dark); border-bottom: 1px solid var(--ng-border) !important; border-top: none !important; background: var(--ng-surface); user-select: none; white-space: nowrap; }
      .nanogrid-table th.ng-sortable:hover { color: var(--ng-accent); cursor: pointer; }
      
      .ng-col-filter { display: block; margin-top: 0.5rem; width: 100%; padding: 0.25rem 0.5rem; font-size: 0.8em; border: 1px solid var(--ng-border); border-radius: 4px; background: var(--ng-bg); color: var(--ng-text-main); font-family: inherit; font-weight: normal; box-sizing: border-box; }
      .nanogrid-sort-icon { margin-left: 0.5rem; font-size: 0.8em; color: inherit; }
      
      .nanogrid-table td { padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--ng-border) !important; color: var(--ng-text-main); background: var(--ng-bg); }
      .nanogrid-table td:first-child, .nanogrid-table th:first-child { border-left: none !important; }
      .nanogrid-table td:last-child, .nanogrid-table th:last-child { border-right: none !important; }
      .nanogrid-table tbody tr:last-child td { border-bottom: none !important; }
      .nanogrid-table tbody tr:hover td { background-color: var(--ng-surface); }
      .nanogrid-table tbody tr.ng-selected td { background-color: var(--ng-accent-ring); }

      .ng-expand-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--ng-accent-ring); color: var(--ng-accent); font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 14px; line-height: 1; user-select: none; }
      .ng-expand-btn::after { content: '+'; position: relative; top: -1px; }
      tr.ng-expanded .ng-expand-btn { background: #fee2e2; color: #dc3545; }
      tr.ng-expanded .ng-expand-btn::after { content: '-'; }
      .ng-expanded-content { padding: 1rem 1.25rem; background: var(--ng-surface); border-bottom: 1px solid var(--ng-border); }

      .ng-res-hidden { display: none !important; }
      .ng-responsive-list { list-style: none; padding: 0; margin: 0; font-size: var(--ng-text-size); }
      .ng-responsive-list li { display: flex; padding: 0.5rem 0; border-bottom: 1px dashed var(--ng-border); }
      .ng-responsive-list li:last-child { border-bottom: none; }
      .ng-res-label { font-weight: 600; min-width: 140px; color: var(--ng-text-muted); }
      .ng-res-value { color: var(--ng-text-main); flex: 1; }

      .nanogrid-table input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 18px; height: 18px; border: 1px solid var(--ng-border); border-radius: 4px; cursor: pointer; transition: all 0.2s; position: relative; display: grid; place-content: center; background: var(--ng-bg); margin: 0; }
      .nanogrid-table input[type="checkbox"]:checked { background: var(--ng-accent); border-color: var(--ng-accent); }
      .nanogrid-table input[type="checkbox"]:checked::before { content: ""; width: 10px; height: 10px; box-shadow: inset 1em 1em white; transform-origin: bottom left; clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%); }

      .nanogrid-footer { display: flex; justify-content: space-between; align-items: center; font-size: var(--ng-text-size); color: var(--ng-text-muted); flex-wrap: wrap; gap: 1rem; }
      .nanogrid-pagination { display: flex; gap: 0.25rem; align-items: center; flex-wrap: wrap; justify-content: center; }
      .nanogrid-page-btn { min-width: 32px; height: 32px; padding: 0 0.4rem; display: flex; align-items: center; justify-content: center; font-size: var(--ng-text-size); font-family: inherit; font-weight: 500; color: var(--ng-text-main); background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
      .nanogrid-page-btn:hover:not(:disabled):not(.active) { background: var(--ng-accent-ring); color: var(--ng-accent); }
      .nanogrid-page-btn.active { background: var(--ng-accent); color: #ffffff !important; border-color: var(--ng-accent); }
      .nanogrid-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .nanogrid-page-dots { color: var(--ng-text-muted); padding: 0 0.25rem; user-select: none; }
      
      @keyframes ng-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      @media (max-width: 640px) {
        .nanogrid-top-bar { flex-direction: column; align-items: stretch; }
        .nanogrid-top-left, .nanogrid-top-right { flex-direction: column; align-items: stretch; width: 100%; }
        .nanogrid-search-wrapper { width: 100%; min-width: 100%; }
        .ng-dropdown { width: 100%; }
        .ng-dropdown-btn { width: 100%; justify-content: space-between; }
        .nanogrid-footer { flex-direction: column; align-items: center; text-align: center; }
      }
    `;
    document.head.appendChild(style);
  }

  async init() {
    this.injectControls();
    this.setupListeners();
    this.renderHeaderArrows();

    // FIXED: I-render ang 0 records na footer bago pa mag-fetch!
    this.updateFooter();

    if (this.config.serverSide) {
      await this.fetchData();
    } else {
      this.processClientSide();
    }

    if (this.config.responsive) {
      this.resizeObserver = new ResizeObserver(this.debounce(() => {
        this.checkResponsiveness();
      }, 100));
      this.resizeObserver.observe(this.tableWrapper);
    }
  }

  checkResponsiveness() {
    if (!this.config.responsive) return;
    
    this.table.style.width = 'max-content';
    
    this.columns.forEach(c => c.responsiveHidden = false);
    this.table.querySelectorAll('.ng-res-hidden').forEach(el => el.classList.remove('ng-res-hidden'));

    let attempts = 0;
    while (this.table.offsetWidth > this.tableWrapper.offsetWidth && attempts < this.columns.length) {
      // FIXED: Iniwasan natin ang .ng-empty-row para HINDI itago ng responsive engine ang empty/loader text!
      let targetCol = [...this.columns].reverse().find(c =>
        !c.hidden && !c.responsiveHidden && !c.isCheckbox && !c.isExpand && !c.isAction && !c.sticky
      );
      if (!targetCol) break; 

      targetCol.responsiveHidden = true;
      targetCol.element.classList.add('ng-res-hidden');
      this.table.querySelectorAll(`tbody tr:not(.ng-expanded-row):not(.ng-empty-row) td:nth-child(${targetCol.index + 1})`).forEach(td => td.classList.add('ng-res-hidden'));
      attempts++;
    }

    this.table.style.width = '100%';

    const expandCol = this.columns.find(c => c.isExpand);
    if (expandCol) {
      const hasHidden = this.columns.some(c => c.responsiveHidden);
      const shouldShow = hasHidden || this.config.rowExpansion;
      if (shouldShow) {
        expandCol.responsiveHidden = false;
        expandCol.element.classList.remove('ng-res-hidden');
        this.table.querySelectorAll(`tbody tr:not(.ng-expanded-row):not(.ng-empty-row) td:nth-child(${expandCol.index + 1})`).forEach(td => td.classList.remove('ng-res-hidden'));
      } else {
        expandCol.responsiveHidden = true;
        expandCol.element.classList.add('ng-res-hidden');
        this.table.querySelectorAll(`tbody tr:not(.ng-expanded-row):not(.ng-empty-row) td:nth-child(${expandCol.index + 1})`).forEach(td => td.classList.add('ng-res-hidden'));
      }
    }

    const visibleCols = this.columns.filter(c => !c.hidden && !c.responsiveHidden).length;
    this.table.querySelectorAll('.ng-expanded-row').forEach(row => {
      const prevTr = row.previousElementSibling;
      const rowData = this.state.filteredData.find(r => String(r[this.config.rowIdField]) === prevTr.dataset.rowId);
      const contentTd = row.querySelector('.ng-expanded-content');
      contentTd.setAttribute('colspan', visibleCols);
      contentTd.innerHTML = this.getExpandedContent(rowData);
    });
  }

  getExpandedContent(row) {
    let html = '';
    const hiddenCols = this.columns.filter(c => c.responsiveHidden && !c.isExpand);
    if (hiddenCols.length > 0) {
      html += `<ul class="ng-responsive-list">`;
      hiddenCols.forEach(col => {
        let cellHtml = '';
        if (this.config.columnDefs && this.config.columnDefs[col.field]) {
          cellHtml = this.config.columnDefs[col.field](row);
        } else {
          cellHtml = col.field && row[col.field] != null ? row[col.field] : '';
        }
        html += `<li><span class="ng-res-label">${col.title}</span> <span class="ng-res-value">${cellHtml}</span></li>`;
      });
      html += `</ul>`;
    }
    
    if (this.config.rowExpansion) {
      html += `<div style="margin-top: 1rem;">${this.config.rowExpansion(row)}</div>`;
    }
    return html;
  }

  injectControls() {
    const topBar = document.createElement('div');
    topBar.className = 'nanogrid-top-bar';
    
    let searchHtml = this.config.searchable ? `<div class="nanogrid-search-wrapper"><svg class="nanogrid-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><input type="text" class="nanogrid-search" placeholder="Search data..." /></div>` : '';

    let exportHtml = this.config.exportable ? `<div class="ng-dropdown" id="ng-export-dropdown"><button class="ng-dropdown-btn" data-ng-toggle="dropdown"><svg class="ng-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export</button><div class="ng-dropdown-menu left-align" style="min-width: 140px;"><div class="ng-dropdown-item" data-action="export" data-type="csv">Export CSV</div><div class="ng-dropdown-item" data-action="export" data-type="xls">Export Excel</div><div class="ng-dropdown-item" data-action="export" data-type="pdf">Print / PDF</div></div></div>` : '';

    let colsHtml = `<div class="ng-dropdown"><button class="ng-dropdown-btn" data-ng-toggle="dropdown"><svg class="ng-dropdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0H5a2 2 0 0 1-2-2v-4m6 6h10a2 2 0 0 0 2-2v-4M3 9h18M3 15h18"/></svg>Columns</button><div class="ng-dropdown-menu left-align" style="min-width: 160px; padding: 0.5rem;">${this.columns.filter(c => c.field && !c.isAction && !c.isCheckbox && !c.isExpand).map(c => `<label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem; font-size: var(--ng-text-size); cursor: pointer; color: var(--ng-text-main);"><input type="checkbox" checked data-col-toggle="${c.field}" style="width: 14px; height: 14px;" /> ${c.title}</label>`).join('')}</div></div>`;

    let rowsHtml = `<div style="display: flex; align-items: center; gap: 0.5rem; width: 100%;"><span class="ng-dropdown-label" style="display: none;">Rows</span><div class="ng-dropdown" id="ng-size-dropdown" style="flex: 1;"><button class="ng-dropdown-btn" data-ng-toggle="dropdown"><span class="ng-select-val">${this.state.pageSize} rows</span><svg class="ng-dropdown-icon rotate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button><div class="ng-dropdown-menu" style="min-width: 100%;">${this.config.pageSizeOptions.map(size => `<div class="ng-dropdown-item ${size === this.state.pageSize ? 'selected' : ''}" data-action="pagesize" data-value="${size}">${size}</div>`).join('')}</div></div></div>`;

    topBar.innerHTML = `<div class="nanogrid-top-left">${searchHtml}${colsHtml}${exportHtml}</div><div class="nanogrid-top-right">${rowsHtml}</div>`;
    this.container.insertBefore(topBar, this.tableWrapper);

    const footer = document.createElement('div');
    footer.className = 'nanogrid-footer';
    footer.innerHTML = `<div class="nanogrid-info"></div><div class="nanogrid-pagination"></div>`;
    this.container.appendChild(footer);
  }

  setupListeners() {
    if (this.config.searchable) {
      this.container.querySelector('.nanogrid-search').addEventListener('input', this.debounce((e) => {
        this.state.search = e.target.value; this.state.page = 1;
        this.config.serverSide ? this.fetchData() : this.processClientSide();
      }, 300));
    }

    this.container.querySelectorAll('.ng-col-filter').forEach(input => {
      input.addEventListener('input', this.debounce((e) => {
        this.state.colFilters[e.target.dataset.col] = e.target.value;
        this.state.page = 1;
        this.config.serverSide ? this.fetchData() : this.processClientSide();
      }, 300));
    });

    this.container.addEventListener('change', (e) => {
      if (e.target.classList.contains('ng-select-all')) {
        const isChecked = e.target.checked;
        const rowCheckboxes = this.container.querySelectorAll('.ng-row-checkbox');
        rowCheckboxes.forEach(cb => {
          cb.checked = isChecked;
          if (isChecked) { this.state.selected.add(cb.value); cb.closest('tr').classList.add('ng-selected'); } 
          else { this.state.selected.delete(cb.value); cb.closest('tr').classList.remove('ng-selected'); }
        });
      }
      if (e.target.classList.contains('ng-row-checkbox')) {
        const rowTr = e.target.closest('tr');
        if (e.target.checked) { this.state.selected.add(e.target.value); rowTr.classList.add('ng-selected'); } 
        else { this.state.selected.delete(e.target.value); rowTr.classList.remove('ng-selected'); }
        const allCheckedOnPage = Array.from(this.container.querySelectorAll('.ng-row-checkbox')).every(c => c.checked);
        const selectAllCb = this.container.querySelector('.ng-select-all');
        if (selectAllCb) selectAllCb.checked = allCheckedOnPage;
      }

      if (e.target.hasAttribute('data-col-toggle')) {
        const field = e.target.getAttribute('data-col-toggle');
        const col = this.columns.find(c => c.field === field);
        if (col) {
          col.hidden = !e.target.checked;
          this.applyColumnVisibility();
          if (this.config.responsive) this.checkResponsiveness();
        }
      }
    });

    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.ng-expand-btn')) {
        const btn = e.target.closest('.ng-expand-btn');
        const tr = btn.closest('tr');
        const rowId = tr.dataset.rowId;
        
        if (this.state.expanded.has(rowId)) {
          this.state.expanded.delete(rowId);
          tr.classList.remove('ng-expanded');
          const nextRow = tr.nextElementSibling;
          if (nextRow && nextRow.classList.contains('ng-expanded-row')) nextRow.remove();
        } else {
          this.state.expanded.add(rowId);
          tr.classList.add('ng-expanded');
          const rowData = this.state.filteredData.find(r => String(r[this.config.rowIdField]) === String(rowId));
          const visibleCols = this.columns.filter(c => !c.hidden && !c.responsiveHidden).length;
          const expansionHtml = this.getExpandedContent(rowData);
          tr.insertAdjacentHTML('afterend', `<tr class="ng-expanded-row"><td colspan="${visibleCols}" class="ng-expanded-content">${expansionHtml}</td></tr>`);
        }
      }
    });

    this.container.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-ng-toggle="dropdown"]');
      if (!toggleBtn && !e.target.closest('.ng-dropdown-menu')) {
        this.container.querySelectorAll('.ng-dropdown-menu.open').forEach(menu => menu.classList.remove('open'));
        this.container.querySelectorAll('.ng-dropdown-btn.active').forEach(btn => btn.classList.remove('active'));
      }
      if (toggleBtn) {
        const dropdown = toggleBtn.closest('.ng-dropdown');
        const menu = dropdown.querySelector('.ng-dropdown-menu');
        const isOpen = menu.classList.contains('open');
        this.container.querySelectorAll('.ng-dropdown-menu').forEach(m => m.classList.remove('open'));
        this.container.querySelectorAll('.ng-dropdown-btn').forEach(b => b.classList.remove('active'));
        if (!isOpen) { menu.classList.add('open'); toggleBtn.classList.add('active'); }
      }

      const pageItem = e.target.closest('[data-action="pagesize"]');
      if (pageItem) {
        const newSize = parseInt(pageItem.dataset.value, 10);
        this.state.pageSize = newSize; this.state.page = 1;
        const dropdown = pageItem.closest('.ng-dropdown');
        dropdown.querySelector('.ng-select-val').textContent = newSize + ' rows';
        dropdown.querySelectorAll('.ng-dropdown-item').forEach(el => el.classList.remove('selected'));
        pageItem.classList.add('selected');
        this.config.serverSide ? this.fetchData() : this.processClientSide();
      }

      const exportItem = e.target.closest('[data-action="export"]');
      if (exportItem) {
        const type = exportItem.dataset.type;
        if (type === 'csv') this.exportCSV();
        if (type === 'xls') this.exportHTMLBased('xls', 'application/vnd.ms-excel');
        if (type === 'pdf') window.print();
      }
    });

    this.container.querySelector('.nanogrid-pagination').addEventListener('click', (e) => {
      const btn = e.target.closest('.nanogrid-page-btn');
      if (!btn || btn.disabled || btn.classList.contains('active')) return;
      const action = btn.dataset.page;
      const totalPages = Math.ceil(this.state.totalRecords / this.state.pageSize);
      if (action === 'prev') this.state.page--;
      else if (action === 'next') this.state.page++;
      else if (action === 'first') this.state.page = 1;
      else if (action === 'last') this.state.page = totalPages;
      else this.state.page = parseInt(action, 10);
      this.config.serverSide ? this.fetchData() : this.processClientSide();
    });

    this.columns.forEach(col => {
      if (col.sortable) col.element.addEventListener('click', () => this.handleSort(col.field));
    });
  }

  applyColumnVisibility() {
    this.columns.forEach((col, i) => {
      col.element.style.display = col.hidden ? 'none' : '';
      // FIXED: Kasama ang not(.ng-empty-row) sa pag-apply ng visibility
      const cells = this.table.querySelectorAll(`tbody tr:not(.ng-expanded-row):not(.ng-empty-row) td:nth-child(${i + 1})`);
      cells.forEach(td => td.style.display = col.hidden ? 'none' : '');
    });
    const visibleCols = this.columns.filter(c => !c.hidden && !c.responsiveHidden).length;
    this.table.querySelectorAll('.ng-expanded-content').forEach(td => td.setAttribute('colspan', visibleCols));
  }

  showProcessing(text = this.config.processingText) {
    if (this.state.data.length === 0) {
      let tbody = this.table.querySelector('tbody');
      if (!tbody) { tbody = document.createElement('tbody'); this.table.appendChild(tbody); }
      // FIXED: In-inject ang ng-empty-row class!
      tbody.innerHTML = `<tr class="ng-empty-row"><td colspan="${this.columns.length}" style="text-align:center; padding: 2rem; color: var(--ng-accent); height: 120px;">
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 600;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: ng-spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
          ${text}
        </div>
      </td></tr>`;
    } else {
      const thead = this.table.querySelector('thead');
      if (thead) {
        this.overlay.style.top = `${thead.offsetHeight}px`;
      } else {
        this.overlay.style.top = '0px';
      }
      this.tableWrapper.classList.add('is-loading');
    }
  }

  hideProcessing() { 
    this.tableWrapper.classList.remove('is-loading'); 
  }

  getSelected() { return Array.from(this.state.selected); }
  reload(newData = null, resetPage = true) {
    if (resetPage) { this.state.page = 1; this.state.expanded.clear(); }
    if (this.config.serverSide) this.fetchData();
    else { if (newData) this.config.data = newData; this.processClientSide(); }
  }

  async fetchData() {
    if (!this.config.ajax) return;
    this.showProcessing(); 
    try {
      let payload = {
        page: this.state.page, pageSize: this.state.pageSize, search: this.state.search, colFilters: this.state.colFilters, sortCol: this.state.sortCol, sortDir: this.state.sortDir
      };

      if (typeof this.config.ajax === 'function') {
        const result = await this.config.ajax(payload);
        this.state.data = result.data || [];
        this.state.totalRecords = result.total || 0;
      } else {
        const isString = typeof this.config.ajax === 'string';
        let url = isString ? this.config.ajax : this.config.ajax.url;
        let method = isString ? 'GET' : (this.config.ajax.method || 'GET').toUpperCase();
        let headers = isString ? {} : (this.config.ajax.headers || {});
        let customData = isString ? {} : (this.config.ajax.data || {});

        payload = { ...payload, ...customData };
        
        let fetchConfig = { method, headers };

        if (method === 'GET') {
          const params = new URLSearchParams();
          Object.entries(payload).forEach(([key, value]) => {
            if (value !== null && value !== '') {
               params.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
            }
          });
          url += (url.includes('?') ? '&' : '?') + params.toString();
        } else {
          fetchConfig.headers['Content-Type'] = 'application/json';
          fetchConfig.headers['Accept'] = 'application/json'; 
          fetchConfig.body = JSON.stringify(payload);
        }

        const response = await fetch(url, fetchConfig);
        
        if (!response.ok) {
            throw new Error(`Server HTTP Error ${response.status}`);
        }

        const json = await response.json();

        let dataSrc = isString ? 'data' : (this.config.ajax.dataSrc || 'data');
        let totalSrc = isString ? 'total' : (this.config.ajax.totalSrc || 'total');

        if (!json || !Array.isArray(json[dataSrc])) {
            throw new Error(`Invalid or missing array at json['${dataSrc}']`);
        }

        this.state.data = json[dataSrc];
        this.state.totalRecords = json[totalSrc] || 0;
      }

    } catch (e) {
      console.error("NanoGrid Backend Error:", e.message);
      this.state.data = [];
      this.state.totalRecords = 0;
      
    } finally {
      this.renderBody(this.state.data);
      this.updateFooter();
      this.hideProcessing();
    }
  }

  processClientSide() {
    this.showProcessing();
    setTimeout(() => {
      let processed = [...this.config.data];

      if (this.state.search) {
        const lowerQuery = this.state.search.toLowerCase();
        processed = processed.filter(row => this.columns.some(col => col.searchable && String(row[col.field] || '').toLowerCase().includes(lowerQuery)));
      }

      Object.entries(this.state.colFilters).forEach(([field, value]) => {
        if (value) {
          const lowerVal = value.toLowerCase();
          processed = processed.filter(row => String(row[field] || '').toLowerCase().includes(lowerVal));
        }
      });

      if (this.state.sortCol) {
        processed.sort((a, b) => {
          let valA = a[this.state.sortCol] || ''; let valB = b[this.state.sortCol] || '';
          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();
          if (valA < valB) return this.state.sortDir === 'asc' ? -1 : 1;
          if (valA > valB) return this.state.sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      this.state.filteredData = processed; 
      this.state.totalRecords = processed.length;
      const start = (this.state.page - 1) * this.state.pageSize;
      this.renderBody(processed.slice(start, start + this.state.pageSize));
      this.updateFooter();
      
      if (this.config.responsive) setTimeout(() => this.checkResponsiveness(), 0);
      
      this.hideProcessing();
    }, 150);
  }

  handleSort(field) {
    this.state.sortDir = this.state.sortCol === field && this.state.sortDir === 'asc' ? 'desc' : 'asc';
    this.state.sortCol = field;
    this.renderHeaderArrows();
    this.config.serverSide ? this.fetchData() : this.processClientSide();
  }

  renderHeaderArrows() {
    this.columns.forEach(col => {
      if (!col.sortable) return;
      const oldIcon = col.element.querySelector('.nanogrid-sort-icon');
      if (oldIcon) oldIcon.remove();
      if (this.state.sortCol === col.field) {
        col.element.insertAdjacentHTML('beforeend', `<span class="nanogrid-sort-icon">${this.state.sortDir === 'asc' ? '↑' : '↓'}</span>`);
      }
    });
  }

  renderBody(data) {
    let tbody = this.table.querySelector('tbody');
    if (!tbody) { tbody = document.createElement('tbody'); this.table.appendChild(tbody); }
    tbody.innerHTML = '';
    
    const selectAllCb = this.container.querySelector('.ng-select-all');
    if (selectAllCb) selectAllCb.checked = false;

    if (data.length === 0) {
      // FIXED: In-inject ang ng-empty-row para hind itago ng checkResponsiveness
      tbody.innerHTML = `<tr class="ng-empty-row"><td colspan="${this.columns.length}" style="text-align:center; padding: 2rem; color: var(--ng-text-muted); height: 120px;">${this.config.emptyText}</td></tr>`;
      return;
    }

    data.forEach(row => {
      const tr = document.createElement('tr');
      const rowIdStr = String(row[this.config.rowIdField]);
      const isSelected = this.state.selected.has(rowIdStr);
      const isExpanded = this.state.expanded.has(rowIdStr);
      
      tr.dataset.rowId = rowIdStr;
      if (isSelected) tr.classList.add('ng-selected');
      if (isExpanded) tr.classList.add('ng-expanded'); 

      this.columns.forEach(col => {
        const td = document.createElement('td');
        if (col.hidden) td.style.display = 'none';
        if (col.responsiveHidden) td.classList.add('ng-res-hidden');
        if (col.sticky) { td.style.position = 'sticky'; td.style[col.sticky] = '0'; td.classList.add(`ng-sticky-${col.sticky}`); }
        
        if (col.isExpand) {
          td.innerHTML = `<div class="ng-expand-btn"></div>`;
        }
        else if (col.isCheckbox) {
          td.innerHTML = `<input type="checkbox" class="ng-row-checkbox" value="${rowIdStr}" ${isSelected ? 'checked' : ''} />`;
        } 
        else {
          if (this.config.columnDefs && this.config.columnDefs[col.field]) td.innerHTML = this.config.columnDefs[col.field](row);
          else td.innerHTML = col.field && row[col.field] != null ? row[col.field] : '';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);

      if (isExpanded) {
        const visibleCols = this.columns.filter(c => !c.hidden && !c.responsiveHidden).length;
        const expansionHtml = this.getExpandedContent(row);
        tbody.insertAdjacentHTML('beforeend', `<tr class="ng-expanded-row"><td colspan="${visibleCols}" class="ng-expanded-content">${expansionHtml}</td></tr>`);
      }
    });

    if (this.config.checkboxes) {
      const allCheckedOnPage = Array.from(this.container.querySelectorAll('.ng-row-checkbox')).every(c => c.checked);
      if (selectAllCb && data.length > 0) selectAllCb.checked = allCheckedOnPage;
    }
  }

  updateFooter() {
    const totalPages = Math.ceil(this.state.totalRecords / this.state.pageSize) || 1;
    if (this.state.page > totalPages && totalPages > 0) { this.state.page = totalPages; this.processClientSide(); return; }

    const start = this.state.totalRecords === 0 ? 0 : (this.state.page - 1) * this.state.pageSize + 1;
    const end = Math.min(this.state.page * this.state.pageSize, this.state.totalRecords);
    
    // FIXED: Format na "Showing 0 to 0 of 0" gaya ng hiling mo
    this.container.querySelector('.nanogrid-info').textContent = this.state.totalRecords > 0 
        ? `Showing ${start} to ${end} of ${this.state.totalRecords}` 
        : 'Showing 0 to 0 of 0';

    const pagContainer = this.container.querySelector('.nanogrid-pagination');
    let pagHtml = `<button class="nanogrid-page-btn" data-page="first" ${this.state.page <= 1 ? 'disabled' : ''} title="First Page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg></button><button class="nanogrid-page-btn" data-page="prev" ${this.state.page <= 1 ? 'disabled' : ''} title="Previous"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>`;

    let startPage = Math.max(1, this.state.page - 1);
    let endPage = Math.min(totalPages, this.state.page + 1);

    if (this.state.page === 1) endPage = Math.min(totalPages, 3);
    if (this.state.page === totalPages) startPage = Math.max(1, totalPages - 2);

    if (startPage > 1) { pagHtml += `<button class="nanogrid-page-btn" data-page="1">1</button>`; if (startPage > 2) pagHtml += `<span class="nanogrid-page-dots">...</span>`; }
    for (let i = startPage; i <= endPage; i++) { pagHtml += `<button class="nanogrid-page-btn ${i === this.state.page ? 'active' : ''}" data-page="${i}">${i}</button>`; }
    if (endPage < totalPages) { if (endPage < totalPages - 1) pagHtml += `<span class="nanogrid-page-dots">...</span>`; pagHtml += `<button class="nanogrid-page-btn" data-page="${totalPages}">${totalPages}</button>`; }

    pagHtml += `<button class="nanogrid-page-btn" data-page="next" ${this.state.page >= totalPages ? 'disabled' : ''} title="Next"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button><button class="nanogrid-page-btn" data-page="last" ${this.state.page >= totalPages ? 'disabled' : ''} title="Last Page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg></button>`;
    pagContainer.innerHTML = pagHtml;
  }

  downloadFile(content, filename, mimeType) { const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
  getExportData() { return this.config.serverSide ? this.state.data : this.state.filteredData; }
  
  exportCSV() {
    const data = this.getExportData();
    const headers = this.columns.filter(c => c.field && !c.hidden && !c.isCheckbox && !c.isExpand && !c.isAction).map(c => `"${c.title}"`).join(',');
    const rows = data.map(row => this.columns.filter(c => c.field && !c.hidden && !c.isCheckbox && !c.isExpand && !c.isAction).map(c => `"${String(row[c.field] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    this.downloadFile(`${headers}\n${rows}`, 'export.csv', 'text/csv;charset=utf-8;');
  }

  exportHTMLBased(ext, mimeType) {
    const data = this.getExportData();
    const headersHtml = this.columns.filter(c => c.field && !c.hidden && !c.isCheckbox && !c.isExpand && !c.isAction).map(c => `<th>${c.title}</th>`).join('');
    const rowsHtml = data.map(row => `<tr>${this.columns.filter(c => c.field && !c.hidden && !c.isCheckbox && !c.isExpand && !c.isAction).map(c => `<td>${row[c.field] || ''}</td>`).join('')}</tr>`).join('');
    const tableHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:${ext === 'xls' ? 'excel' : 'word'}" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    this.downloadFile(tableHtml, `export.${ext}`, mimeType);
  }

  debounce(f, w) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), w); }; }
}