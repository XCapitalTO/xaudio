let selectedFormat = 'mp3';
let librarySongs = [];

// Inicializa SortableJS para Drag-and-Drop quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('song-list');
  if (el && typeof Sortable !== 'undefined') {
    new Sortable(el, {
      animation: 150,
      handle: '.song-drag-handle',
      onEnd: function (evt) {
        // Atualiza a ordem no array ao arrastar
        const itemEl = librarySongs.splice(evt.oldIndex, 1)[0];
        librarySongs.splice(evt.newIndex, 0, itemEl);
      }
    });
  }

  // Rotação do Carrossel de Anúncios
  const adSlides = document.querySelectorAll('.ad-slide');
  if (adSlides.length > 0) {
    let currentSlide = 0;
    setInterval(() => {
      adSlides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % adSlides.length;
      adSlides[currentSlide].classList.add('active');
    }, 5000); // Troca a cada 5 segundos
  }
});

function toggleLibrary() {
  const drawer = document.getElementById('lib-drawer');
  const overlay = document.getElementById('lib-overlay');
  if (drawer.classList.contains('show')) {
    drawer.classList.remove('show');
    overlay.classList.remove('show');
  } else {
    drawer.classList.add('show');
    overlay.classList.add('show');
    renderLibrary();
  }
}

function addToLibrary(filename, objectUrl, ext, quality) {
  librarySongs.push({
    id: Date.now().toString(),
    filename: filename,
    url: objectUrl,
    ext: ext,
    quality: quality
  });
  renderLibrary();
  
  // Pisca o ícone de notificação na Biblioteca
  const libNav = document.querySelector('.fa-music').parentElement;
  libNav.style.color = 'var(--accent)';
  setTimeout(() => libNav.style.color = '', 1000);
}

function removeFromLibrary(index) {
  librarySongs.splice(index, 1);
  renderLibrary();
}

function renderLibrary() {
  const list = document.getElementById('song-list');
  const empty = document.getElementById('lib-empty');
  
  list.innerHTML = '';
  if (librarySongs.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    librarySongs.forEach((song, idx) => {
      const li = document.createElement('li');
      li.className = 'song-item';
      li.innerHTML = `
        <i class="fa-solid fa-grip-vertical song-drag-handle"></i>
        <div class="song-info">
          <div class="song-title" title="${song.filename}">${song.filename}</div>
          <div class="song-meta">${song.ext} · ${song.quality}</div>
        </div>
        <button class="btn-remove-song" onclick="removeFromLibrary(${idx})">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      list.appendChild(li);
    });
  }
}

// Download Sequencial de todos da biblioteca
document.querySelector('.lib-footer .btn-primary').onclick = async () => {
  if (librarySongs.length === 0) return;
  const btn = document.querySelector('.lib-footer .btn-primary');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando...';
  
  for (let i = 0; i < librarySongs.length; i++) {
    const a = document.createElement('a');
    a.href = librarySongs[i].url;
    a.download = librarySongs[i].filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await new Promise(r => setTimeout(r, 800)); // Pequeno delay entre downloads para não travar o navegador
  }
  
  btn.innerHTML = '<i class="fa-solid fa-check"></i> Concluído';
  setTimeout(() => btn.innerHTML = originalHtml, 2000);
};

function selectFormat(el) {
  document.querySelectorAll('.f-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  selectedFormat = el.dataset.fmt;
}

async function pasteUrl() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('url-input').value = text;
  } catch(e) {
    document.getElementById('url-input').focus();
  }
}

function startDownload() {
  const url = document.getElementById('url-input').value.trim();
  const urlGroup = document.getElementById('url-group');
  
  if (!url) {
    document.getElementById('url-input').focus();
    urlGroup.style.borderColor = 'var(--danger)';
    setTimeout(() => urlGroup.style.borderColor = '', 1200);
    return;
  }

  const isYT = /youtu\.?be|youtube\.com/.test(url);
  if (!isYT) {
    document.getElementById('url-input').style.color = 'var(--danger)';
    setTimeout(() => document.getElementById('url-input').style.color = '', 1200);
    return;
  }

  const btn = document.getElementById('btn-download');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span> Processando...</span>';

  const pw = document.getElementById('progress-wrap');
  const pf = document.getElementById('progress-fill');
  const pt = document.getElementById('progress-text');
  const pp = document.getElementById('progress-percent');
  
  pw.classList.add('show');
  document.getElementById('result-card').classList.remove('show');

  const quality = document.getElementById('quality-select').value;
  const trimStart = document.getElementById('trim-start').value.trim();
  const trimEnd = document.getElementById('trim-end').value.trim();
  const normalize = document.getElementById('normalize-audio').checked;

  const steps = [
    [10, 'Analisando pacote de dados...'],
    [30, 'Conectando aos servidores dedicados...'],
    [55, 'Extraindo stream de áudio bruto...'],
    [75, 'Transcodificando para ' + selectedFormat.toUpperCase() + ' Studio...'],
    [90, 'Finalizando masterização e metadados...']
  ];

  let i = 0;
  // Avança a barra de progresso até 90%
  const interval = setInterval(() => {
    if (i >= steps.length) {
      clearInterval(interval);
      return;
    }
    pf.style.width = steps[i][0] + '%';
    pt.textContent = steps[i][1];
    pp.textContent = steps[i][0] + '%';
    i++;
  }, 1200);

  // Faz a requisição real ao backend
  fetch('http://localhost:3000/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, format: selectedFormat, quality, trimStart, trimEnd, normalize })
  })
  .then(async response => {
    if (!response.ok) {
        const err = await response.json().catch(()=>({}));
        throw new Error(err.error || 'Erro na conversão');
    }
    // Pega o header content-disposition para extrair o nome do arquivo, se possível
    const disposition = response.headers.get('content-disposition');
    let filename = 'audio.' + selectedFormat;
    if (disposition && disposition.indexOf('filename="') !== -1) {
        const matches = disposition.match(/filename="([^"]+)"/);
        if (matches != null && matches[1]) filename = matches[1];
    }
    
    return response.blob().then(blob => ({ blob, filename }));
  })
  .then(({ blob, filename }) => {
    clearInterval(interval);
    pf.style.width = '100%';
    pt.textContent = 'Tudo pronto!';
    pp.textContent = '100%';
    
    setTimeout(() => showResult(blob, filename), 400);
  })
  .catch(err => {
    clearInterval(interval);
    pt.textContent = 'Erro: ' + err.message;
    pf.style.backgroundColor = 'var(--danger)';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span> Tentar Novamente</span>';
  });
}

function showResult(blob, filename) {
  const btn = document.getElementById('btn-download');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span> Iniciar Nova Extração</span>';

  document.getElementById('progress-wrap').classList.remove('show');

  const qualitySelect = document.getElementById('quality-select');
  const qualityText = qualitySelect.options[qualitySelect.selectedIndex].text;
  
  const ext = filename.split('.').pop().toUpperCase();
  document.getElementById('result-meta').textContent = ext + ' · ' + qualityText;
  
  // Atualiza o título do resultado com o nome do arquivo se possível
  const titleEl = document.getElementById('result-title');
  titleEl.textContent = filename.replace('.' + ext.toLowerCase(), '');

  const rc = document.getElementById('result-card');
  rc.classList.add('show');

  // Cria a URL para o blob baixado
  const objectUrl = window.URL.createObjectURL(blob);

  const btnFinal = document.getElementById('btn-dl-final');
  // Remove event listeners antigos clonando o botão
  const newBtn = btnFinal.cloneNode(true);
  btnFinal.parentNode.replaceChild(newBtn, btnFinal);

  // Adiciona a música à biblioteca logo que estiver pronta
  addToLibrary(filename, objectUrl, ext, qualityText);

  newBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Limpa o campo de URL para uma melhor UX (Ajuste fino solicitado)
    document.getElementById('url-input').value = '';
    
    newBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvo!';
    newBtn.style.backgroundColor = '#b0d940';
    setTimeout(() => {
      newBtn.innerHTML = '<i class="fa-solid fa-download"></i> Salvar';
      newBtn.style.backgroundColor = '';
    }, 2500);
  };
}
