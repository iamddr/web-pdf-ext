// 初始化PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 获取DOM元素
const fileInput = document.getElementById('pdfFile');
const bookmarkList = document.getElementById('bookmarkList');
const loadingDiv = document.getElementById('loading');
const dropZone = document.getElementById('dropZone');

let currentPdfFile = null;

// 获取批量导出按钮
const toggleBatchBtn = document.getElementById('toggleBatchBtn');
const exportMultipleBtn = document.getElementById('exportMultipleBtn');
const exportSingleBtn = document.getElementById('exportSingleBtn');
const batchExportContainer = document.querySelector('.batch-export-container');

// 获取悬浮按钮
const toggleAllBtn = document.getElementById('toggleAllBtn');
const floatingButtons = document.querySelector('.floating-buttons');

// 处理文件函数
async function handleFile(file) {
    if (file && file.type === 'application/pdf') {
        try {
            currentPdfFile = file;
            // 显示文件名
            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'file-name';
            fileNameDiv.textContent = file.name;
            bookmarkList.innerHTML = '';
            bookmarkList.appendChild(fileNameDiv);
            
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            // 获取大纲（书签）
            const outline = await pdf.getOutline();
            if (outline) {
                await displayBookmarks(outline, pdf.numPages, pdf);
                // 显示悬浮按钮
                floatingButtons.style.display = 'flex';
                // 初始化书签状态
                initializeBookmarks();
            } else {
                bookmarkList.innerHTML = '<p>该PDF文件没有书签。</p>';
                // 隐藏悬浮按钮
                floatingButtons.style.display = 'none';
            }
        } catch (error) {
            console.error('处理PDF时出错:', error);
            bookmarkList.innerHTML = '<p>处理PDF时出错，请检查文件是否有效。</p>';
            // 隐藏悬浮按钮
            floatingButtons.style.display = 'none';
        }
    } else {
        bookmarkList.innerHTML = '<p>请选择有效的PDF文件。</p>';
        // 隐藏悬浮按钮
        floatingButtons.style.display = 'none';
    }
}

// 监听文件选择
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    handleFile(file);
});

// 拖放相关事件处理
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('drag-over');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('drag-over');
    });
});

dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    handleFile(file);
});

// 获取书签的实际页码
async function getBookmarkPageNumber(dest, pdf) {
    console.log('解析书签目标:', dest);
    
    if (!dest) {
        console.log('书签目标为空');
        return null;
    }

    try {
        // 如果dest是引用字符串，需要先解析它
        if (typeof dest === 'string') {
            const destArray = await pdf.getDestination(dest);
            console.log('解析后的目标数组:', destArray);
            dest = destArray;
        }

        if (!Array.isArray(dest)) {
            console.log('书签目标不是数组格式');
            return null;
        }

        // 获取页面引用
        const pageRef = dest[0];
        console.log('页面引用对象:', pageRef);

        if (!pageRef) {
            console.log('页面引用为空');
            return null;
        }

        // 如果是页面引用对象，需要获取实际的页面
        if (typeof pageRef === 'object') {
            const page = await pdf.getPageIndex(pageRef);
            console.log('获取到实际页码:', page + 1);
            return page + 1; // 页码从0开始，需要加1
        }
        
        // 如果是直接的页码数字
        if (typeof pageRef === 'number') {
            console.log('直接获取页码数字:', pageRef);
            return pageRef;
        }

        console.log('无法获取有效页码');
        return null;
    } catch (error) {
        console.error('获取页码时出错:', error);
        return null;
    }
}

// 获取书签的结束页码
async function getBookmarkEndPage(bookmark, nextBookmark, totalPages, pdf) {
    // 如果有子书签，使用最后一个子书签的结束页码
    if (bookmark.items && bookmark.items.length > 0) {
        const lastChild = bookmark.items[bookmark.items.length - 1];
        // 递归获取最后一个子书签的结束页码
        return await getBookmarkEndPage(lastChild, nextBookmark, totalPages, pdf);
    }
    
    // 如果有下一个书签，使用下一个书签的起始页码减1
    if (nextBookmark) {
        const nextPageNum = await getBookmarkPageNumber(nextBookmark.dest, pdf);
        if (nextPageNum && nextPageNum <= totalPages) {
            return nextPageNum - 1;
        }
    }
    
    // 如果是最后一个书签，使用当前页码
    const currentPageNum = await getBookmarkPageNumber(bookmark.dest, pdf);
    return currentPageNum && currentPageNum <= totalPages ? currentPageNum : totalPages;
}

// 提取页面文本
async function extractPageText(pageNumber, pdf) {
    try {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const words = textContent.items.map(item => item.str).join(' ').split(' ');
        return words.slice(0, 100).join(' ');
    } catch (error) {
        console.error('提取文本时出错:', error);
        return '提取文本时出错';
    }
}

// 显示书签
async function displayBookmarks(outline, totalPages, pdf, level = 0, container = bookmarkList, parentNextBookmark = null) {
    if (level === 0) {
        // 保持文件名显示
        const fileNameDiv = container.querySelector('.file-name');
        container.innerHTML = '';
        if (fileNameDiv) {
            container.appendChild(fileNameDiv);
        }
    }

    for (let i = 0; i < outline.length; i++) {
        const bookmark = outline[i];
        const nextBookmark = outline[i + 1] || parentNextBookmark;
        
        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'bookmark-item';

        // 获取当前书签的起始页码
        const startPageNum = await getBookmarkPageNumber(bookmark.dest, pdf);
        const startPage = startPageNum && startPageNum <= totalPages ? startPageNum : 1;

        // 获取结束页码
        let endPage;
        
        if (bookmark.items && bookmark.items.length > 0) {
            // 如果有子书签，使用最后一个子书签的结束页码
            const lastChild = bookmark.items[bookmark.items.length - 1];
            endPage = await getBookmarkEndPage(lastChild, nextBookmark, totalPages, pdf);
        } else {
            // 如果没有子书签，获取当前书签的结束页码
            endPage = await getBookmarkEndPage(bookmark, nextBookmark, totalPages, pdf);
        }

        // 确保页码范围有效
        if (!endPage || endPage < startPage || endPage > totalPages) {
            endPage = startPage;
        }

        // 创建书签内容
        const contentDiv = document.createElement('div');
        contentDiv.className = 'bookmark-content';
        contentDiv.style.marginLeft = `${level * 20}px`;

        // 添加复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bookmark-checkbox';
        checkbox.dataset.start = startPage;
        checkbox.dataset.end = endPage;
        contentDiv.appendChild(checkbox);

        // 添加展开/折叠按钮（如果有子书签）
        if (bookmark.items && bookmark.items.length > 0) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-btn';
            toggleBtn.textContent = '+'; // 初始状态为折叠
            contentDiv.appendChild(toggleBtn);

            // 创建子书签容器
            const childContainer = document.createElement('div');
            childContainer.className = 'child-container';
            childContainer.style.display = 'none'; // 初始状态为折叠
            
            // 添加展开/折叠功能
            toggleBtn.onclick = () => {
                const childContainer = bookmarkDiv.querySelector('.child-container');
                if (childContainer.style.display === 'none') {
                    childContainer.style.display = 'block';
                    toggleBtn.textContent = '−';
                } else {
                    childContainer.style.display = 'none';
                    toggleBtn.textContent = '+';
                }
            };
        }

        // 添加书签标题和描述按钮的容器
        const titleContainer = document.createElement('span');
        titleContainer.className = 'title-text';
        
        // 添加书签标题
        const titleText = document.createElement('span');
        titleText.textContent = bookmark.title || '无标题';
        titleContainer.appendChild(titleText);

        // 如果是最深层次的书签（没有子书签），添加描述按钮
        if (!bookmark.items || bookmark.items.length === 0) {
            const descBtn = document.createElement('button');
            descBtn.className = 'desc-btn';
            descBtn.textContent = '描述';
            titleContainer.appendChild(descBtn);

            // 为描述按钮添加事件监听器
            descBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                // 移除之前的描述文本（如果存在）
                const existingDesc = bookmarkDiv.querySelector('.description-text');
                if (existingDesc) {
                    existingDesc.remove();
                    return;
                }

                // 创建描述文本容器
                const descDiv = document.createElement('div');
                descDiv.className = 'description-text';
                descDiv.style.marginLeft = `${level * 20 + 20}px`;
                descDiv.textContent = '正在提取文本...';
                bookmarkDiv.appendChild(descDiv);

                // 提取并显示文本
                const text = await extractPageText(startPage, pdf);
                descDiv.textContent = text;
            });
        }

        contentDiv.appendChild(titleContainer);

        // 添加页码
        const pageSpan = document.createElement('span');
        pageSpan.className = 'page-number';
        pageSpan.textContent = `（第 ${startPage} 页${startPage !== endPage ? ` - ${endPage} 页` : ''}）`;
        contentDiv.appendChild(pageSpan);

        // 添加导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'export-btn';
        exportBtn.textContent = '导出PDF';
        exportBtn.dataset.start = startPage;
        exportBtn.dataset.end = endPage;
        contentDiv.appendChild(exportBtn);

        bookmarkDiv.appendChild(contentDiv);
        container.appendChild(bookmarkDiv);

        // 为导出按钮添加事件监听器
        exportBtn.addEventListener('click', () => {
            const start = parseInt(exportBtn.dataset.start);
            const end = parseInt(exportBtn.dataset.end);
            extractAndDownloadPDF(start, end);
        });

        // 递归处理子书签
        if (bookmark.items && bookmark.items.length > 0) {
            const childContainer = document.createElement('div');
            childContainer.className = 'child-container';
            childContainer.style.display = 'none'; // 初始状态为折叠
            bookmarkDiv.appendChild(childContainer);
            // 传递下一个书签信息给子书签
            await displayBookmarks(bookmark.items, totalPages, pdf, level + 1, childContainer, nextBookmark);
        }
    }
}

// 提取并下载PDF
async function extractAndDownloadPDF(startPage, endPage) {
    if (!currentPdfFile) {
        alert('请先选择PDF文件');
        return;
    }

    loadingDiv.style.display = 'block';

    try {
        const arrayBuffer = await currentPdfFile.arrayBuffer();
        
        // 使用PDF-lib来创建新的PDF
        const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.esm.min.js');
        
        // 创建新的PDF文档
        const newPdf = await PDFDocument.create();
        const sourceDoc = await PDFDocument.load(arrayBuffer);
        
        // 复制指定页面（注意：PDF-lib的页码是从0开始的，所以需要减1）
        const pageIndices = Array.from(
            { length: endPage - startPage + 1 }, 
            (_, i) => startPage - 1 + i
        );
        
        // 确保页码在有效范围内
        const validPageIndices = pageIndices.filter(
            index => index >= 0 && index < sourceDoc.getPageCount()
        );
        
        if (validPageIndices.length === 0) {
            throw new Error('无效的页码范围');
        }
        
        const pages = await newPdf.copyPages(sourceDoc, validPageIndices);
        
        // 添加页面到新文档
        pages.forEach(page => newPdf.addPage(page));
        
        // 保存新PDF
        const newPdfBytes = await newPdf.save();
        
        // 创建下载链接
        const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `提取的PDF_${startPage}_到_${endPage}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        loadingDiv.style.display = 'none';
    } catch (error) {
        console.error('提取PDF时出错:', error);
        alert('提取PDF时出错，请重试');
        loadingDiv.style.display = 'none';
    }
}

// 切换批量选择模式
toggleBatchBtn.addEventListener('click', () => {
    const bookmarkList = document.getElementById('bookmarkList');
    bookmarkList.classList.toggle('show-checkbox');
    
    // 更新按钮文字和样式
    if (bookmarkList.classList.contains('show-checkbox')) {
        toggleBatchBtn.textContent = '取消批量';
        toggleBatchBtn.classList.add('active');
        // 显示导出按钮
        exportMultipleBtn.style.display = 'flex';
        exportSingleBtn.style.display = 'flex';
    } else {
        toggleBatchBtn.textContent = '批量导出';
        toggleBatchBtn.classList.remove('active');
        // 隐藏导出按钮
        exportMultipleBtn.style.display = 'none';
        exportSingleBtn.style.display = 'none';
        // 取消所有选中状态
        const checkboxes = bookmarkList.querySelectorAll('.bookmark-checkbox');
        checkboxes.forEach(checkbox => checkbox.checked = false);
    }
});

// 监听复选框变化
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('bookmark-checkbox')) {
        const hasChecked = document.querySelector('.bookmark-checkbox:checked');
        
        // 处理父子书签联动
        const bookmarkItem = e.target.closest('.bookmark-item');
        if (bookmarkItem) {
            // 获取所有子书签的复选框
            const childCheckboxes = bookmarkItem.querySelectorAll('.child-container .bookmark-checkbox');
            // 将子书签的选中状态设置为与父书签一致
            childCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            
            // 向上查找父书签，更新其状态
            updateParentCheckboxState(e.target);
        }
        
        // 更新导出按钮显示状态
        if (hasChecked) {
            exportMultipleBtn.style.display = 'flex';
            exportSingleBtn.style.display = 'flex';
        } else {
            exportMultipleBtn.style.display = 'none';
            exportSingleBtn.style.display = 'none';
        }
    }
});

// 更新父书签的选中状态
function updateParentCheckboxState(checkbox) {
    const currentItem = checkbox.closest('.bookmark-item');
    const childContainer = currentItem.closest('.child-container');
    if (!childContainer) return;
    
    const parentItem = childContainer.closest('.bookmark-item');
    if (!parentItem) return;
    
    const parentCheckbox = parentItem.querySelector('.bookmark-checkbox');
    if (!parentCheckbox) return;
    
    // 获取同级所有复选框
    const siblingCheckboxes = childContainer.querySelectorAll(':scope > .bookmark-item > .bookmark-content > .bookmark-checkbox');
    
    // 检查是否所有同级复选框都被选中
    const allChecked = Array.from(siblingCheckboxes).every(cb => cb.checked);
    const anyChecked = Array.from(siblingCheckboxes).some(cb => cb.checked);
    
    // 更新父书签的选中状态
    parentCheckbox.checked = allChecked;
    
    // 继续向上递归更新
    updateParentCheckboxState(parentCheckbox);
}

// 导出多个PDF并打包成zip
exportMultipleBtn.addEventListener('click', async () => {
    const checkedBookmarks = document.querySelectorAll('.bookmark-checkbox:checked');
    if (checkedBookmarks.length === 0) return;

    loadingDiv.style.display = 'block';
    loadingDiv.textContent = '正在处理中，请稍候...';
    
    try {
        // 创建新的ZIP实例
        const zip = new JSZip();
        const arrayBuffer = await currentPdfFile.arrayBuffer();
        const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.esm.min.js');
        
        // 创建源文档
        const sourceDoc = await PDFDocument.load(arrayBuffer);
        
        // 处理每个选中的书签
        for (const checkbox of checkedBookmarks) {
            const bookmarkTitle = checkbox.closest('.bookmark-content').querySelector('.title-text').textContent.trim();
            loadingDiv.textContent = `正在处理：${bookmarkTitle}`;
            
            // 创建新的PDF文档
            const newPdf = await PDFDocument.create();
            const startPage = parseInt(checkbox.dataset.start) - 1;
            const endPage = parseInt(checkbox.dataset.end) - 1;
            
            // 复制页面
            const pageIndices = Array.from(
                { length: endPage - startPage + 1 }, 
                (_, i) => startPage + i
            ).filter(index => index >= 0 && index < sourceDoc.getPageCount());
            
            const pages = await newPdf.copyPages(sourceDoc, pageIndices);
            pages.forEach(page => newPdf.addPage(page));
            
            // 保存PDF并添加到zip
            const pdfBytes = await newPdf.save();
            
            // 使用书签标题作为文件名（移除不合法的字符）
            const safeTitle = bookmarkTitle.replace(/[<>:"/\\|?*]/g, '_');
            zip.file(`${safeTitle}.pdf`, pdfBytes);
        }
        
        loadingDiv.textContent = '正在生成ZIP文件...';
        
        // 生成并下载zip文件
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9
            }
        });
        
        // 使用原始PDF文件名作为ZIP文件名的一部分
        const pdfFileName = currentPdfFile.name.replace('.pdf', '');
        const zipFileName = `${pdfFileName}_提取的书签.zip`;
        
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('批量导出PDF时出错:', error);
        alert('批量导出PDF时出错，请重试');
    }
    
    loadingDiv.style.display = 'none';
    loadingDiv.textContent = '正在处理中，请稍候...';
});

// 合并为单个PDF
exportSingleBtn.addEventListener('click', async () => {
    const checkedBookmarks = document.querySelectorAll('.bookmark-checkbox:checked');
    if (checkedBookmarks.length === 0) return;

    loadingDiv.style.display = 'block';
    
    try {
        const arrayBuffer = await currentPdfFile.arrayBuffer();
        const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.esm.min.js');
        
        // 创建新的PDF文档
        const newPdf = await PDFDocument.create();
        const sourceDoc = await PDFDocument.load(arrayBuffer);
        
        // 收集所有需要复制的页面
        for (const checkbox of checkedBookmarks) {
            const startPage = parseInt(checkbox.dataset.start) - 1; // 转换为0基页码
            const endPage = parseInt(checkbox.dataset.end) - 1;
            
            const pageIndices = Array.from(
                { length: endPage - startPage + 1 }, 
                (_, i) => startPage + i
            ).filter(index => index >= 0 && index < sourceDoc.getPageCount());
            
            const pages = await newPdf.copyPages(sourceDoc, pageIndices);
            pages.forEach(page => newPdf.addPage(page));
        }
        
        // 保存合并的PDF
        const newPdfBytes = await newPdf.save();
        const blob = new Blob([newPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `合并的PDF.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('合并PDF时出错:', error);
        alert('合并PDF时出错，请重试');
    }
    
    loadingDiv.style.display = 'none';
});

// 获取所有未折叠的最深层子书签容器
function getDeepestVisibleContainers() {
    const allContainers = Array.from(document.querySelectorAll('.child-container'));
    return allContainers.filter(container => {
        // 容器必须是可见的
        if (container.style.display === 'none') return false;
        
        // 检查是否有子容器，且子容器都是隐藏的
        const childContainers = container.querySelectorAll('.child-container');
        return childContainers.length === 0 || Array.from(childContainers).every(child => child.style.display === 'none');
    });
}

// 检查是否所有容器都已折叠
function areAllContainersCollapsed() {
    const allContainers = document.querySelectorAll('.child-container');
    return Array.from(allContainers).every(container => container.style.display === 'none');
}

// 更新按钮图标
function updateToggleButtonIcon(isExpanded) {
    const svg = toggleAllBtn.querySelector('svg');
    svg.innerHTML = isExpanded ? 
        '<line x1="7" y1="12" x2="17" y2="12"></line><polyline points="12 7 12 17"></polyline>' : 
        '<line x1="7" y1="12" x2="17" y2="12"></line>';
}

// 获取最大层级深度
function getMaxLevel() {
    let maxLevel = 0;
    const processLevel = (element, currentLevel) => {
        maxLevel = Math.max(maxLevel, currentLevel);
        const childContainer = element.querySelector('.child-container');
        if (childContainer) {
            const children = childContainer.querySelectorAll(':scope > .bookmark-item');
            children.forEach(child => processLevel(child, currentLevel + 1));
        }
    };
    
    const topLevelItems = bookmarkList.querySelectorAll(':scope > .bookmark-item');
    topLevelItems.forEach(item => processLevel(item, 0));
    return maxLevel;
}

// 折叠所有层级
function collapseAllLevels() {
    const containers = document.querySelectorAll('.child-container');
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    
    containers.forEach(container => {
        container.style.display = 'none';
    });
    
    toggleBtns.forEach(btn => {
        btn.textContent = '+';
    });
    
    updateToggleButtonIcon(false);
}

// 展开到指定层级
function expandToLevel(targetLevel) {
    const processLevel = (element, currentLevel) => {
        const container = element.querySelector('.child-container');
        const toggleBtn = element.querySelector('.toggle-btn');
        
        if (container) {
            if (currentLevel < targetLevel) {
                container.style.display = 'block';
                if (toggleBtn) toggleBtn.textContent = '−';
                
                const children = container.querySelectorAll(':scope > .bookmark-item');
                children.forEach(child => processLevel(child, currentLevel + 1));
            } else {
                container.style.display = 'none';
                if (toggleBtn) toggleBtn.textContent = '+';
            }
        }
    };
    
    const topLevelItems = bookmarkList.querySelectorAll(':scope > .bookmark-item');
    topLevelItems.forEach(item => processLevel(item, 0));
    
    updateToggleButtonIcon(targetLevel > 0);
}

// 初始化时展开所有层级
function initializeBookmarks() {
    maxLevel = getMaxLevel();
    console.log('初始化最大层级:', maxLevel);
    // 初始状态设置为全折叠
    currentLevel = 0;
    collapseAllLevels();
}

// 处理折叠/展开逻辑
let currentLevel = 0;
let maxLevel = 0;

toggleAllBtn.addEventListener('click', () => {
    console.log('当前层级:', currentLevel, '最大层级:', maxLevel);
    
    if (currentLevel === 0) {
        // 如果当前是折叠状态，展开到第一层
        currentLevel = 1;
        expandToLevel(currentLevel);
    } else if (currentLevel >= maxLevel) {
        // 如果已经展开到最大层级，全部折叠
        currentLevel = 0;
        collapseAllLevels();
    } else {
        // 展开下一层
        currentLevel++;
        expandToLevel(currentLevel);
    }
    
    console.log('展开到层级:', currentLevel);
    
    // 更新按钮提示文本
    if (currentLevel === 0) {
        toggleAllBtn.title = '全部折叠';
    } else if (currentLevel === maxLevel) {
        toggleAllBtn.title = '已展开全部层级';
    } else {
        toggleAllBtn.title = `已展开 ${currentLevel} 层`;
    }
}); 