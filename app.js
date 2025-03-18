// 初始化PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 获取DOM元素
const fileInput = document.getElementById('pdfFile');
const bookmarkList = document.getElementById('bookmarkList');
const loadingDiv = document.getElementById('loading');

let currentPdfFile = null;

// 监听文件选择
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
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
            } else {
                bookmarkList.innerHTML = '<p>该PDF文件没有书签。</p>';
            }
        } catch (error) {
            console.error('处理PDF时出错:', error);
            bookmarkList.innerHTML = '<p>处理PDF时出错，请检查文件是否有效。</p>';
        }
    } else {
        bookmarkList.innerHTML = '<p>请选择有效的PDF文件。</p>';
    }
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

        // 添加展开/折叠按钮（如果有子书签）
        if (bookmark.items && bookmark.items.length > 0) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-btn';
            toggleBtn.textContent = '−';
            contentDiv.appendChild(toggleBtn);

            // 创建子书签容器
            const childContainer = document.createElement('div');
            childContainer.className = 'child-container';
            childContainer.style.display = 'block';
            
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

        // 添加书签标题
        const titleSpan = document.createElement('span');
        titleSpan.className = 'title-text';
        titleSpan.textContent = bookmark.title || '无标题';
        contentDiv.appendChild(titleSpan);

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