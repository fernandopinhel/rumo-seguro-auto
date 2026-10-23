/*
 * Rumo Auto: utilitários compartilhados.
 * JavaScript puro (sem dependências). Nada aqui é enviado a servidor:
 * o estado do protótipo fica apenas no sessionStorage do navegador.
 */
(function () {
  'use strict';

  var PREFIXO = 'rumo:';

  // sessionStorage pode lançar exceção (modo privado, cota, bloqueio de cookies).
  var store = {
    get: function (chave, padrao) {
      try {
        var bruto = window.sessionStorage.getItem(PREFIXO + chave);
        return bruto === null ? padrao : JSON.parse(bruto);
      } catch (e) {
        return padrao;
      }
    },
    set: function (chave, valor) {
      try {
        window.sessionStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
      } catch (e) { /* sem persistência: o protótipo segue funcionando */ }
    },
    remove: function (chave) {
      try { window.sessionStorage.removeItem(PREFIXO + chave); } catch (e) { /* idem */ }
    }
  };

  // Região viva única para anúncios a leitores de tela.
  function announce(mensagem) {
    var regiao = document.getElementById('anuncios');
    if (!regiao) return;
    // Limpa antes para que a mesma mensagem repetida seja anunciada de novo.
    regiao.textContent = '';
    window.setTimeout(function () { regiao.textContent = mensagem; }, 60);
  }

  function icon(nome) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', 'img/icons.svg#i-' + nome);
    svg.appendChild(use);
    return svg;
  }

  // Cria um elemento com classe e texto, sem nunca interpretar HTML.
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  var formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function moeda(valor) { return formatoMoeda.format(valor || 0); }

  var formatoInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  function inteiro(valor) { return formatoInteiro.format(valor || 0); }

  function reduzMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Diálogos nativos: [data-abrir="id"] abre, [data-fechar] fecha, e o foco volta a quem abriu.
  function abrirDialogo(id, origem) {
    var d = document.getElementById(id);
    if (!d || d.open) return;
    d._origem = origem || document.activeElement;
    d.showModal();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {
      var abrir = e.target.closest('[data-abrir]');
      if (abrir) abrirDialogo(abrir.getAttribute('data-abrir'), abrir);
      var fechar = e.target.closest('[data-fechar]');
      if (fechar) fechar.closest('dialog').close();
    });

    document.querySelectorAll('dialog').forEach(function (d) {
      d.addEventListener('close', function () {
        if (d._origem && document.contains(d._origem) && !d._origem.closest('[hidden]')) d._origem.focus();
        d._origem = null;
      });
      // Clique no fundo escurecido fecha o diálogo, exceto nos que pedem uma decisão.
      d.addEventListener('click', function (e) {
        if (e.target === d && !d.hasAttribute('data-obrigatorio')) d.close();
      });
    });
  });

  window.RUMO = {
    store: store,
    announce: announce,
    icon: icon,
    el: el,
    moeda: moeda,
    inteiro: inteiro,
    reduzMovimento: reduzMovimento,
    abrirDialogo: abrirDialogo
  };
})();
