export class DropdownList {
    constructor(element, options = {}) {
        // keep original element clone for restore
        this.originalElement = element.cloneNode(true);
        this.element = element;
        this.options = {
            placeholder: '',
            loadingText: 'Loading...',
            emptyListText: 'No results found',
            defaultHeaderText: 'Items',
	    headerLabels: {},
            searchable: true,
            template: (item) => item.name,
            doNotFilterElement: false,
            isReadOnly: false,
            ...options
        };
        this.items = [];
        this.selectedItem = null;
        this.shouldRenderOnShow = true;
        this.boundDocMouseUp = this.handleDocMouseUp.bind(this);
        this.initialize();
    }

    initialize() {
        this.container = document.createElement('div');
        this.container.className = 'dropdown-list-container';
        
        this.input = document.createElement('input');
        this.input.className = 'input dropdown-list-input';
        this.input.placeholder = this.options.placeholder;
        this.input.readOnly = this.options.isReadOnly;
        this.input.type = 'text';
        this.input.style.width = '100%';
        
        this.list = document.createElement('ul');
        this.list.className = 'dropdown-list';
        this.list.style.display = 'none';

        this.container.appendChild(this.input);
        this.container.appendChild(this.list);

        this.element.replaceWith(this.container);
        
        this.input.addEventListener('focus', () => {
            if (this.list.style.display === 'block') {
                if (this.input.value && !this.options.doNotFilterElement) {
                    this.filterItems(this.input.value);
                }
            } else {
                this.showList();
            }
        });

        this.input.addEventListener('blur', () => {
            if (!this.isMouseDown) {
                setTimeout(() => {
                    if (!this.isMouseDown) this.hideList();
                }, 0);
            }
        });

        if (!this.options.doNotFilterElement) {
            this.input.addEventListener('input', (e) => {
                this.filterItems(e.target.value);
                if (this.list.style.display !== 'block') {
                    this.showList();
                }
            });
        }
        
        this.list.addEventListener('mousedown', () => this.isMouseDown = true);
        this.list.addEventListener('mouseup', () => this.isMouseDown = false);
        
        document.addEventListener('mouseup', this.boundDocMouseUp);

        this.shouldRenderOnShow = true;
    }

    handleDocMouseUp() {
        if (this.isMouseDown) {
            this.isMouseDown = false;
        }
    }

    setItems(items) {
        this.items = items;
        this.shouldRenderOnShow = true;
    }

    filterItems(searchTerm) {
        if (this.options.doNotFilterElement) {
            return;
        }
        
        const terms = searchTerm.toLowerCase().trim().split(/\s+/);
        if (terms.length === 0 || (terms.length === 1 && terms[0] === '')) {
            this.renderItems(this.items);
            return;
        }
        
        const filtered = this.items.filter(item => {
            const baseText = item.name || item.text || '';
            const extraText = item.searchText || '';
            const itemText = (baseText + ' ' + extraText).toLowerCase();
            return terms.every(term => itemText.includes(term));
        });
        
        this.renderItems(filtered);
    }

    renderItems(items = this.items) {
        this.list.innerHTML = '';
        
        if (this.isLoading) {
            const loadingItem = document.createElement('li');
            loadingItem.className = 'dropdown-list-item empty';
            loadingItem.textContent = this.options.loadingText;
            this.list.appendChild(loadingItem);
            // Reposition if this is an oSkills dropdown
            if (this.isOSkillsDropdown) {
                setTimeout(() => this.positionOSkillsDropdown(), 0);
            }
            return;
        }
        
        const itemsToRender = this.options.doNotFilterElement ? this.items : items;

        if (itemsToRender.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'dropdown-list-item empty';
            emptyItem.textContent = this.options.emptyListText;
            this.list.appendChild(emptyItem);
            // Reposition if this is an oSkills dropdown
            if (this.isOSkillsDropdown) {
                setTimeout(() => this.positionOSkillsDropdown(), 0);
            }
            return;
        }

        const groupedItems = itemsToRender.reduce((groups, item) => {
            const type = item.type || this.options.defaultHeaderText;
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(item);
            return groups;
        }, {});
        
        Object.entries(groupedItems).forEach(([type, groupItems]) => {
            if (groupItems.length === 0) return;
        
            const header = document.createElement('li');
            header.className = 'dropdown-list-header';
            
	    const label =
    		this.options.headerLabels[type] ||
    		type ||
    		this.options.defaultHeaderText;

            const headerText = document.createElement('span');
            headerText.className = 'dropdown-header-text';
            headerText.textContent = label;
            
            const countBadge = document.createElement('span');
            countBadge.className = 'dropdown-header-count';
            countBadge.textContent = ` (${groupItems.length})`;
            
            header.appendChild(headerText);
            header.appendChild(countBadge);
            
            this.list.appendChild(header);
            
            groupItems.forEach(item => {
                const li = document.createElement('li');
                li.className = 'dropdown-list-item';
                li.innerHTML = this.options.template(item);
                li.addEventListener('mousedown', () => {
                    this.selectItem(item);
                    this.hideList();
                });
                this.list.appendChild(li);
            });
        });
        
        // Reposition if this is an oSkills dropdown after rendering
        if (this.isOSkillsDropdown) {
            setTimeout(() => this.positionOSkillsDropdown(), 0);
        }
    }

    selectItem(item) {
        this.selectedItem = item;
        this.input.value = item?.name || item?.text || '';
        if (this.options.onSelect) {
            this.options.onSelect(item);
        }
        this.container.dispatchEvent(new CustomEvent('change', { detail: item }));
    }

    showList() {
        this.list.style.display = 'block';
        
        // Check if this is the oSkills dropdown by looking up the DOM tree
        let currentElement = this.container;
        let isOSkillsDropdown = false;
        
        // Trace up the DOM tree to find oskill-dropdown element or oskillPanel
        while (currentElement && currentElement !== document.body) {
            if (currentElement.id === 'oskill-dropdown' || 
                currentElement.classList.contains('oskill-dropdown-wrapper') ||
                currentElement.id === 'oskillPanel') {
                isOSkillsDropdown = true;
                break;
            }
            currentElement = currentElement.parentElement;
        }
        
        
        if (isOSkillsDropdown) {
            // Store reference to this dropdown for later updates
            this.isOSkillsDropdown = true;
            this.positionOSkillsDropdown();
        }
        
        if (this.shouldRenderOnShow) {
            if (this.input.value && !this.options.doNotFilterElement) {
                this.filterItems(this.input.value);
            } else {
                this.renderItems();
            }
            this.shouldRenderOnShow = false;
        }
    }

    positionOSkillsDropdown() {
        if (!this.isOSkillsDropdown) return;
        
        // Get input position
        const inputRect = this.input.getBoundingClientRect();
        
        // Position dropdown below input, aligned to left, but don't go off-screen
        this.list.style.position = 'fixed';
        this.list.style.transform = 'none';
        this.list.style.minWidth = inputRect.width + 'px';

        
        // Get actual dropdown height after rendering
        const dropdownHeight = this.list.clientHeight ;
        
        // Calculate position to center dropdown relative to input
        let leftPos = inputRect.left + inputRect.width;
        let topPos = inputRect.bottom - Math.floor(dropdownHeight / 2 + inputRect.height / 2);
        
        this.list.style.left = leftPos + 'px';
        this.list.style.top = topPos + 'px';
    }

    hideList() {
        this.list.style.display = 'none';
    }

    get value() {
        return this.selectedItem?.value || null;
    }

    set value(val) {
        const item = this.items.find(i => i.value === val);
        if (item) {
            this.selectItem(item);
        } else {
            this.input.value = '';
            this.selectedItem = null;
        }
    }

    destroy() {
        document.removeEventListener('mouseup', this.boundDocMouseUp);
        this.container.replaceWith(this.originalElement);
    }

    async loadItemsAsync(loaderFunction) {
        this.isLoading = true;
        this.renderItems();
        
        try {
            const items = await loaderFunction();
            this.setItems(items);
        } catch (error) {
            console.error('Failed to load items:', error);
            this.setItems([]);
        } finally {
            this.isLoading = false;
        }
    }
}
