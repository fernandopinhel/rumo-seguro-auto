/*
 * Rumo Auto: cotação e contratação de seguro auto em 5 etapas.
 *
 * - As etapas "Você" e "Veículo" são uma conversa: uma pergunta por vez, e cada
 *   resposta vira uma linha do fio, com botão para alterar.
 * - A estrada no topo mostra as etapas (aria-current="step") e o carrinho anda
 *   até a etapa atual.
 * - Validação por pergunta, com mensagem no campo (aria-invalid + aria-describedby).
 *   Depois da primeira tentativa, o erro some enquanto a pessoa corrige.
 * - Preço calculado no navegador a partir do carro, do perfil e das coberturas.
 * - Rascunho no sessionStorage. Os dados do cartão nunca são guardados.
 *
 * Nada é enviado a servidor: o protótipo não tem back-end.
 */
(function () {
  'use strict';

  var RUMO = window.RUMO;
  var DADOS = window.RUMO_DADOS;

  var ETAPAS = ['cliente', 'veiculo', 'cotacao', 'confirmacao', 'pagamento'];
  var TITULOS = {
    cliente: 'Sobre você',
    veiculo: 'Sobre o carro',
    cotacao: 'Sua cotação',
    confirmacao: 'Confira os dados',
    pagamento: 'Pagamento'
  };
  var PERGUNTAS = {
    cliente: ['contato', 'estadoCivil', 'nascimento', 'sexo', 'cpf', 'jovens', 'principal', 'motorista'],
    veiculo: ['placa', 'versao', 'uso', 'endereco', 'pernoite', 'detalhes', 'vigencia']
  };
  var NOMES_ESTADO_CIVIL = { solteira: 'Solteiro(a)', casada: 'Casado(a) ou união estável', divorciada: 'Divorciado(a)', viuva: 'Viúvo(a)' };
  var NOMES_USO = { lazer: 'Dia a dia e lazer', trabalho: 'Trabalho', aplicativo: 'Motorista de aplicativo' };
  var NOMES_PERNOITE = { garagem: 'Garagem fechada', estacionamento: 'Estacionamento', rua: 'Na rua' };
  var NOMES_RELACAO = { conjuge: 'Cônjuge ou companheiro(a)', filho: 'Filho(a)', pais: 'Pai ou mãe', outro: 'Outra pessoa' };

  function estadoInicial() {
    return {
      tela: 'entrada',
      etapa: 'cliente',
      maxEtapa: 0,
      r: {},
      feitas: {},
      atual: { cliente: 'contato', veiculo: 'placa' },
      candidatos: [],
      plano: '',
      personalizado: null,
      cobranca: { mesmoEndereco: '' },
      logado: false,
      voltarPara: ''
    };
  }

  var estado = estadoInicial();
  var andandoTimer = null;

  /* ------------------------------------------------------------ Utilitários */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function digitos(v) { return String(v || '').replace(/\D/g, ''); }
  function indiceEtapa(e) { return ETAPAS.indexOf(e); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  function formatarData(d) {
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  // "dd/mm/aaaa" -> Date, só se a data existir no calendário.
  function lerData(v) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || ''));
    if (!m) return null;
    var dia = Number(m[1]), mes = Number(m[2]) - 1, ano = Number(m[3]);
    var data = new Date(ano, mes, dia);
    if (data.getFullYear() !== ano || data.getMonth() !== mes || data.getDate() !== dia) return null;
    return data;
  }

  function hoje() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function idade(nascimento) {
    var h = new Date();
    var anos = h.getFullYear() - nascimento.getFullYear();
    var m = h.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < nascimento.getDate())) anos--;
    return anos;
  }

  function maisUmAno(d) { var f = new Date(d); f.setFullYear(f.getFullYear() + 1); return f; }

  function cpfValido(v) {
    var c = digitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
      var dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(c[t])) return false;
    }
    return true;
  }

  function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function luhn(numero) {
    var soma = 0, dobra = false;
    for (var i = numero.length - 1; i >= 0; i--) {
      var n = Number(numero[i]);
      if (dobra) { n *= 2; if (n > 9) n -= 9; }
      soma += n;
      dobra = !dobra;
    }
    return soma % 10 === 0;
  }

  function bandeira(numero) {
    var n = digitos(numero);
    if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return 'elo';
    if (/^3[47]/.test(n)) return 'amex';
    if (/^4/.test(n)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
    return '';
  }
  var NOMES_BANDEIRA = { visa: 'Visa', mastercard: 'Mastercard', elo: 'Elo', amex: 'American Express' };

  function placaNormal(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function placaValida(v) { return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaNormal(v)); }

  function primeiroNome() {
    var nome = estado.r.contato && estado.r.contato.nome;
    return nome ? nome.trim().split(/\s+/)[0] : '';
  }

  function separarPreco(v) {
    var centavos = Math.round(v * 100);
    return { inteiro: Math.floor(centavos / 100), centavos: ',' + String(centavos % 100).padStart(2, '0') };
  }

  /* ------------------------------------------------------------ Máscaras */
  var MASCARAS = {
    telefone: function (v) {
      var d = digitos(v).slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    },
    data: function (v) {
      var d = digitos(v).slice(0, 8);
      if (d.length > 4) return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
      if (d.length > 2) return d.slice(0, 2) + '/' + d.slice(2);
      return d;
    },
    cpf: function (v) {
      var d = digitos(v).slice(0, 11);
      if (d.length > 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
      if (d.length > 6) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
      if (d.length > 3) return d.slice(0, 3) + '.' + d.slice(3);
      return d;
    },
    cep: function (v) {
      var d = digitos(v).slice(0, 8);
      return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    },
    cartao: function (v) { return digitos(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); },
    validade: function (v) {
      var d = digitos(v).slice(0, 4);
      return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    }
  };

  /* ------------------------------------------------------------ Erros */
  function idErro(el) { return (el.type === 'radio' ? el.name : el.id) + '-erro'; }

  function limparErro(el) {
    var alvo = el.type === 'radio' ? $all('input[name="' + el.name + '"]', el.form || document) : [el];
    alvo.forEach(function (i) { i.removeAttribute('aria-invalid'); });
    var p = document.getElementById(idErro(el));
    if (p) { p.hidden = true; p.textContent = ''; }
  }

  function marcarErro(el, msg) {
    var p = document.getElementById(idErro(el));
    if (el.type === 'radio') {
      $all('input[name="' + el.name + '"]').forEach(function (i) { i.setAttribute('aria-invalid', 'true'); });
    } else {
      el.setAttribute('aria-invalid', 'true');
      if (p) {
        var desc = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (desc.indexOf(p.id) === -1) { desc.push(p.id); el.setAttribute('aria-describedby', desc.join(' ')); }
      }
    }
    if (p) { p.textContent = msg; p.hidden = false; }
  }

  // erros: [{ el, msg }]. Devolve true quando está tudo certo.
  function aplicarErros(container, erros) {
    $all('input, select', container).forEach(limparErro);
    container.setAttribute('data-tentou', '');
    if (!erros.length) return true;
    erros.forEach(function (e) { marcarErro(e.el, e.msg); });
    erros[0].el.focus();
    RUMO.announce(erros.length === 1 ? 'Falta corrigir um campo.' : 'Faltam corrigir ' + erros.length + ' campos.');
    return false;
  }

  /* ------------------------------------------------------------ Preço */
  function niveisDoPlano(id) {
    if (id === 'personalizado') return estado.personalizado || copia(DADOS.planos[1].niveis);
    for (var i = 0; i < DADOS.planos.length; i++) if (DADOS.planos[i].id === id) return DADOS.planos[i].niveis;
    return null;
  }

  function nomeDoPlano(id) {
    if (id === 'personalizado') return 'Personalizado';
    for (var i = 0; i < DADOS.planos.length; i++) if (DADOS.planos[i].id === id) return DADOS.planos[i].nome;
    return '';
  }

  function cobertura(id) {
    for (var i = 0; i < DADOS.coberturas.length; i++) if (DADOS.coberturas[i].id === id) return DADOS.coberturas[i];
    return null;
  }

  function idadeCliente() {
    var d = lerData(estado.r.nascimento);
    return d ? idade(d) : 35;
  }

  // Ajustes de perfil, com rótulo para mostrar o que pesou no preço.
  function fatoresDeRisco() {
    var r = estado.r, a = DADOS.ajustes, lista = [];
    if (r.uso && a.uso[r.uso] !== 1) lista.push({ rotulo: NOMES_USO[r.uso], mult: a.uso[r.uso] });
    if (r.pernoite) lista.push({ rotulo: NOMES_PERNOITE[r.pernoite], mult: a.pernoite[r.pernoite] });
    if (r.jovens === 'sim') lista.push({ rotulo: 'Motoristas de 18 a 25 anos', mult: a.jovens });
    if (r.detalhes && r.detalhes.blindado === 'sim') lista.push({ rotulo: 'Blindagem', mult: a.blindado });
    if (r.detalhes && r.detalhes.gas === 'sim') lista.push({ rotulo: 'Kit gás', mult: a.gas });
    var i = idadeCliente();
    if (i < 26) lista.push({ rotulo: 'Idade abaixo de 26 anos', mult: 1.15 });
    return lista;
  }

  function precoMensal(niveis) {
    var v = estado.r.veiculo;
    if (!v || !niveis) return 0;
    var soma = 0;
    DADOS.coberturas.forEach(function (c) {
      var n = niveis[c.id] || 0;
      if (c.id === 'franquia' && !niveis.colisao) n = 0;
      soma += c.niveis[n].fator;
    });
    var mult = fatoresDeRisco().reduce(function (acc, f) { return acc * f.mult; }, 1);
    return v.fipe * soma / 100 * mult / 12;
  }

  // Texto de cada cobertura num plano, com a franquia em reais.
  function textoCobertura(c, niveis) {
    var n = niveis[c.id] || 0;
    if (c.id === 'franquia') {
      if (!niveis.colisao) return { texto: 'Não se aplica', tipo: '' };
      var fipe = estado.r.veiculo ? estado.r.veiculo.fipe : 0;
      var valor = fipe * (n === 2 ? 0.025 : 0.05);
      return { texto: (n === 2 ? 'Reduzida, ' : 'Normal, ') + 'R$ ' + RUMO.inteiro(valor), tipo: '' };
    }
    var rotulo = c.niveis[n].rotulo;
    if (/^Não inclui/.test(rotulo)) return { texto: rotulo, tipo: 'nao' };
    if (rotulo === 'Inclui' || c.fixa) return { texto: rotulo, tipo: 'sim' };
    return { texto: rotulo, tipo: '' };
  }

  /* ------------------------------------------------------------ Persistência */
  function salvar() {
    RUMO.store.set('rascunho', {
      tela: estado.tela, etapa: estado.etapa, maxEtapa: estado.maxEtapa, r: estado.r, feitas: estado.feitas,
      atual: estado.atual, candidatos: estado.candidatos, plano: estado.plano, personalizado: estado.personalizado,
      cobranca: estado.cobranca, logado: estado.logado, voltarPara: estado.voltarPara
    });
  }

  function temRascunho() {
    var s = RUMO.store.get('rascunho', null);
    return !!(s && s.r && s.r.contato);
  }

  function apolicesNovas() { return RUMO.store.get('apolices', []); }

  /* ------------------------------------------------------------ Perguntas */
  function val(form, nome) {
    var el = form.elements[nome];
    if (!el) return '';
    return String(el.value || '').trim();
  }
  function radio(form, nome) { return form.elements[nome][0]; }
  function marcarRadio(form, nome, valor) {
    $all('input[name="' + nome + '"]', form).forEach(function (i) { i.checked = i.value === valor; });
  }

  function visivel(p) {
    if (p === 'motorista') return estado.r.principal === 'nao';
    return true;
  }

  function validarNome(el, erros, rotulo) {
    var v = el.value.trim();
    if (!v) erros.push({ el: el, msg: 'Informe ' + rotulo + '.' });
    else if (v.split(/\s+/).length < 2) erros.push({ el: el, msg: 'Informe nome e sobrenome.' });
  }

  function validarNascimento(el, erros) {
    var d = lerData(el.value);
    if (!el.value.trim()) erros.push({ el: el, msg: 'Informe a data de nascimento.' });
    else if (!d) erros.push({ el: el, msg: 'Use o formato dia/mês/ano, por exemplo 12/04/1991.' });
    else if (idade(d) < 18) erros.push({ el: el, msg: 'Quem dirige precisa ter pelo menos 18 anos.' });
    else if (idade(d) > 100) erros.push({ el: el, msg: 'Confira o ano de nascimento.' });
  }

  function validarCpf(el, erros) {
    if (!el.value.trim()) erros.push({ el: el, msg: 'Informe o CPF.' });
    else if (!cpfValido(el.value)) erros.push({ el: el, msg: 'Esse CPF não existe. Confira os números.' });
  }

  function exigirRadio(form, nome, msg, erros) {
    if (!val(form, nome)) erros.push({ el: radio(form, nome), msg: msg });
  }

  var Q = {
    contato: {
      preencher: function (f) {
        var c = estado.r.contato || {};
        f.elements.nome.value = c.nome || '';
        f.elements.telefone.value = c.telefone || '';
        f.elements.email.value = c.email || '';
      },
      validar: function (f) {
        var erros = [];
        validarNome(f.elements.nome, erros, 'o seu nome completo');
        var tel = digitos(f.elements.telefone.value);
        if (!tel) erros.push({ el: f.elements.telefone, msg: 'Informe um celular com DDD.' });
        else if (tel.length !== 11 || tel[2] !== '9') erros.push({ el: f.elements.telefone, msg: 'O celular tem DDD e 9 dígitos, como (21) 98123-4567.' });
        if (!val(f, 'email')) erros.push({ el: f.elements.email, msg: 'Informe o seu e-mail.' });
        else if (!emailValido(val(f, 'email'))) erros.push({ el: f.elements.email, msg: 'Confira o e-mail, ele precisa ter @ e domínio, como nome@exemplo.com.br.' });
        return erros;
      },
      salvar: function (f) { estado.r.contato = { nome: val(f, 'nome').replace(/\s+/g, ' '), telefone: val(f, 'telefone'), email: val(f, 'email') }; },
      resumo: function () { var c = estado.r.contato; return c.nome + ', ' + c.telefone + ', ' + c.email; }
    },
    estadoCivil: {
      preencher: function (f) { marcarRadio(f, 'estadoCivil', estado.r.estadoCivil); },
      validar: function (f) { var e = []; exigirRadio(f, 'estadoCivil', 'Escolha uma opção.', e); return e; },
      salvar: function (f) { estado.r.estadoCivil = val(f, 'estadoCivil'); },
      resumo: function () { return NOMES_ESTADO_CIVIL[estado.r.estadoCivil]; }
    },
    nascimento: {
      preencher: function (f) { f.elements.nascimento.value = estado.r.nascimento || ''; },
      validar: function (f) { var e = []; validarNascimento(f.elements.nascimento, e); return e; },
      salvar: function (f) { estado.r.nascimento = val(f, 'nascimento'); },
      resumo: function () { return estado.r.nascimento + ', ' + idade(lerData(estado.r.nascimento)) + ' anos'; }
    },
    sexo: {
      preencher: function (f) { marcarRadio(f, 'sexo', estado.r.sexo); },
      validar: function (f) { var e = []; exigirRadio(f, 'sexo', 'Escolha uma opção.', e); return e; },
      salvar: function (f) { estado.r.sexo = val(f, 'sexo'); },
      resumo: function () { return estado.r.sexo === 'feminino' ? 'Feminino' : 'Masculino'; }
    },
    cpf: {
      preencher: function (f) { f.elements.cpf.value = estado.r.cpf || ''; },
      validar: function (f) { var e = []; validarCpf(f.elements.cpf, e); return e; },
      salvar: function (f) { estado.r.cpf = val(f, 'cpf'); },
      resumo: function () { return estado.r.cpf; }
    },
    jovens: {
      preencher: function (f) { marcarRadio(f, 'jovens', estado.r.jovens); },
      validar: function (f) { var e = []; exigirRadio(f, 'jovens', 'Escolha sim ou não.', e); return e; },
      salvar: function (f) { estado.r.jovens = val(f, 'jovens'); },
      // Responder "não" pede a confirmação do aviso antes de seguir.
      antes: function (f, seguir) {
        if (val(f, 'jovens') !== 'nao' || estado.r.cienteJovens) return seguir();
        abrirAvisoJovens(f, seguir);
      },
      resumo: function () { return estado.r.jovens === 'sim' ? 'Sim, incluir na cobertura' : 'Não, e estou ciente da regra'; }
    },
    principal: {
      preencher: function (f) { marcarRadio(f, 'principal', estado.r.principal); },
      validar: function (f) { var e = []; exigirRadio(f, 'principal', 'Escolha uma opção.', e); return e; },
      salvar: function (f) { estado.r.principal = val(f, 'principal'); },
      resumo: function () { return estado.r.principal === 'sim' ? 'Sou eu' : 'Outra pessoa'; }
    },
    motorista: {
      preencher: function (f) {
        var m = estado.r.motorista || {};
        f.elements.motNome.value = m.nome || '';
        f.elements.motCpf.value = m.cpf || '';
        f.elements.motNascimento.value = m.nascimento || '';
        f.elements.motRelacao.value = m.relacao || '';
        f.elements.motEstadoCivil.value = m.estadoCivil || '';
      },
      validar: function (f) {
        var e = [];
        validarNome(f.elements.motNome, e, 'o nome completo');
        validarCpf(f.elements.motCpf, e);
        if (!e.length || e[e.length - 1].el !== f.elements.motCpf) {
          if (digitos(f.elements.motCpf.value) === digitos(estado.r.cpf)) e.push({ el: f.elements.motCpf, msg: 'Esse é o seu CPF. Informe o CPF de quem mais dirige.' });
        }
        validarNascimento(f.elements.motNascimento, e);
        if (!f.elements.motRelacao.value) e.push({ el: f.elements.motRelacao, msg: 'Escolha a relação com você.' });
        if (!f.elements.motEstadoCivil.value) e.push({ el: f.elements.motEstadoCivil, msg: 'Escolha o estado civil.' });
        return e;
      },
      salvar: function (f) {
        estado.r.motorista = {
          nome: val(f, 'motNome').replace(/\s+/g, ' '), cpf: val(f, 'motCpf'), nascimento: val(f, 'motNascimento'),
          relacao: f.elements.motRelacao.value, estadoCivil: f.elements.motEstadoCivil.value
        };
      },
      resumo: function () { var m = estado.r.motorista; return m.nome + ', ' + NOMES_RELACAO[m.relacao].toLowerCase(); }
    },

    placa: {
      preencher: function (f) {
        var p = estado.r.placa || {};
        marcarRadio(f, 'sabePlaca', p.sabe);
        f.elements.placa.value = p.placa || '';
        if (p.marca) { f.elements.marca.value = p.marca; atualizarModelos(f); f.elements.modelo.value = p.modelo || ''; }
        if (p.anoFab) { f.elements.anoFab.value = p.anoFab; atualizarAnoModelo(f); f.elements.anoModelo.value = p.anoModelo || ''; }
        mostrarCaminhoPlaca(f);
      },
      validar: function (f) {
        var e = [];
        var sabe = val(f, 'sabePlaca');
        if (!sabe) { exigirRadio(f, 'sabePlaca', 'Escolha sim ou não.', e); return e; }
        if (sabe === 'sim') {
          if (!val(f, 'placa')) e.push({ el: f.elements.placa, msg: 'Informe a placa.' });
          else if (!placaValida(val(f, 'placa'))) e.push({ el: f.elements.placa, msg: 'Placa inválida. Use 3 letras e 4 caracteres, como ABC1D23 ou ABC-1234.' });
        } else {
          if (!f.elements.marca.value) e.push({ el: f.elements.marca, msg: 'Escolha a marca.' });
          if (!f.elements.modelo.value) e.push({ el: f.elements.modelo, msg: 'Escolha o modelo.' });
          if (!f.elements.anoFab.value) e.push({ el: f.elements.anoFab, msg: 'Escolha o ano de fabricação.' });
          if (!f.elements.anoModelo.value) e.push({ el: f.elements.anoModelo, msg: 'Escolha o ano do modelo.' });
        }
        return e;
      },
      salvar: function (f) {
        var novo = val(f, 'sabePlaca') === 'sim'
          ? { sabe: 'sim', placa: placaNormal(val(f, 'placa')) }
          : { sabe: 'nao', marca: f.elements.marca.value, modelo: f.elements.modelo.value, anoFab: f.elements.anoFab.value, anoModelo: f.elements.anoModelo.value };
        // Outra placa ou outro modelo invalida a versão escolhida antes.
        if (JSON.stringify(novo) !== JSON.stringify(estado.r.placa)) {
          delete estado.r.veiculo;
          delete estado.feitas.versao;
        }
        estado.r.placa = novo;
        estado.candidatos = buscarCandidatos(novo);
      },
      resumo: function () {
        var p = estado.r.placa;
        return p.sabe === 'sim' ? 'Placa ' + formatarPlaca(p.placa) : p.marca + ' ' + p.modelo + ', ' + p.anoFab + '/' + p.anoModelo;
      }
    },
    versao: {
      preencher: function (f) { montarVersoes(f); },
      validar: function (f) { var e = []; if (!val(f, 'versao')) e.push({ el: radio(f, 'versao') || f.querySelector('input'), msg: 'Escolha o seu carro na lista.' }); return e; },
      salvar: function (f) {
        var id = val(f, 'versao');
        estado.r.veiculo = estado.candidatos.filter(function (c) { return c.id === id; })[0];
      },
      resumo: function () { var v = estado.r.veiculo; return v.versao + ', ' + v.ano; }
    },
    uso: {
      preencher: function (f) { marcarRadio(f, 'uso', estado.r.uso); },
      validar: function (f) { var e = []; exigirRadio(f, 'uso', 'Escolha uma opção.', e); return e; },
      salvar: function (f) { estado.r.uso = val(f, 'uso'); },
      resumo: function () { return NOMES_USO[estado.r.uso]; }
    },
    endereco: {
      preencher: function (f) {
        var a = estado.r.endereco || {};
        ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(function (k) { f.elements[k].value = a[k] || ''; });
        $('#bloco-endereco').hidden = !a.rua;
      },
      validar: function (f) {
        var e = [];
        var cep = digitos(f.elements.cep.value);
        if (!cep) e.push({ el: f.elements.cep, msg: 'Informe o CEP.' });
        else if (cep.length !== 8) e.push({ el: f.elements.cep, msg: 'O CEP tem 8 números.' });
        else if ($('#bloco-endereco').hidden) buscarCep(f.elements.cep, true);
        if (cep.length === 8) {
          if (!val(f, 'rua')) e.push({ el: f.elements.rua, msg: 'Informe a rua.' });
          if (!val(f, 'numero')) e.push({ el: f.elements.numero, msg: 'Informe o número. Se não houver, escreva S/N.' });
          if (!val(f, 'bairro')) e.push({ el: f.elements.bairro, msg: 'Informe o bairro.' });
          if (!val(f, 'cidade')) e.push({ el: f.elements.cidade, msg: 'Informe a cidade.' });
          if (!f.elements.uf.value) e.push({ el: f.elements.uf, msg: 'Escolha o estado.' });
        }
        return e;
      },
      salvar: function (f) {
        var a = {};
        ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(function (k) { a[k] = val(f, k); });
        estado.r.endereco = a;
      },
      resumo: function () { return textoEndereco(estado.r.endereco); }
    },
    pernoite: {
      preencher: function (f) { marcarRadio(f, 'pernoite', estado.r.pernoite); },
      validar: function (f) { var e = []; exigirRadio(f, 'pernoite', 'Escolha uma opção.', e); return e; },
      salvar: function (f) { estado.r.pernoite = val(f, 'pernoite'); },
      resumo: function () { return NOMES_PERNOITE[estado.r.pernoite]; }
    },
    detalhes: {
      preencher: function (f) {
        var d = estado.r.detalhes || {};
        marcarRadio(f, 'financiado', d.financiado); marcarRadio(f, 'blindado', d.blindado); marcarRadio(f, 'gas', d.gas);
      },
      validar: function (f) {
        var e = [];
        exigirRadio(f, 'financiado', 'Responda se o carro é financiado.', e);
        exigirRadio(f, 'blindado', 'Responda se o carro é blindado.', e);
        exigirRadio(f, 'gas', 'Responda se o carro tem kit gás.', e);
        return e;
      },
      salvar: function (f) { estado.r.detalhes = { financiado: val(f, 'financiado'), blindado: val(f, 'blindado'), gas: val(f, 'gas') }; },
      resumo: function () { return textoDetalhes(estado.r.detalhes); }
    },
    vigencia: {
      preencher: function (f) {
        f.elements.inicio.value = estado.r.inicio || formatarData(hoje());
        atualizarFimVigencia();
      },
      validar: function (f) {
        var e = [], el = f.elements.inicio, d = lerData(el.value);
        var limite = hoje(); limite.setDate(limite.getDate() + 30);
        if (!el.value.trim()) e.push({ el: el, msg: 'Informe a data de início.' });
        else if (!d) e.push({ el: el, msg: 'Use o formato dia/mês/ano.' });
        else if (d < hoje()) e.push({ el: el, msg: 'O seguro não pode começar no passado. Use hoje ou uma data futura.' });
        else if (d > limite) e.push({ el: el, msg: 'O início pode ser em até 30 dias, até ' + formatarData(limite) + '.' });
        return e;
      },
      salvar: function (f) { estado.r.inicio = val(f, 'inicio'); },
      resumo: function () { return textoVigencia(); }
    }
  };

  function formatarPlaca(p) {
    p = placaNormal(p);
    return /^[A-Z]{3}[0-9]{4}$/.test(p) ? p.slice(0, 3) + '-' + p.slice(3) : p;
  }

  function textoEndereco(a) {
    if (!a) return '';
    return a.rua + ', ' + a.numero + (a.complemento ? ', ' + a.complemento : '') + ', ' + a.bairro + ', ' + a.cidade + ' (' + a.uf + '), CEP ' + a.cep;
  }

  function textoDetalhes(d) {
    if (!d) return '';
    return [
      d.financiado === 'sim' ? 'Financiado' : 'Quitado',
      d.blindado === 'sim' ? 'blindado' : 'sem blindagem',
      d.gas === 'sim' ? 'com kit gás' : 'sem kit gás'
    ].join(', ');
  }

  function textoVigencia() {
    var d = lerData(estado.r.inicio);
    return d ? formatarData(d) + ' até ' + formatarData(maisUmAno(d)) : '';
  }

  /* ------------------------------------------------------------ Veículo */
  function buscarCandidatos(p) {
    var porId = {};
    DADOS.veiculos.forEach(function (v) { porId[v.id] = v; });
    if (p.sabe === 'sim') {
      var ids = DADOS.placas[p.placa];
      if (!ids) {
        // Placa desconhecida: escolhe um carro fixo a partir das letras, para a demonstração.
        var soma = 0;
        for (var i = 0; i < p.placa.length; i++) soma += p.placa.charCodeAt(i) * (i + 1);
        ids = [DADOS.veiculos[soma % DADOS.veiculos.length].id];
      }
      return ids.map(function (id) { return copia(porId[id]); });
    }
    // Sem placa: as versões do modelo, ajustadas para o ano escolhido.
    var ano = Number(p.anoModelo);
    return DADOS.veiculos.filter(function (v) { return v.marca === p.marca && v.modelo === p.modelo; }).map(function (v) {
      var c = copia(v);
      c.id = v.id + '-' + ano;
      c.fipe = Math.round(v.fipe * Math.pow(0.93, v.ano - ano) / 10) * 10;
      c.ano = ano;
      return c;
    });
  }

  function montarVersoes(f) {
    var lista = $('#lista-versoes');
    lista.textContent = '';
    var p = estado.r.placa || {};
    var titulo = $('#versao-titulo');
    titulo.textContent = '';
    if (p.sabe === 'sim') {
      titulo.appendChild(document.createTextNode(estado.candidatos.length > 1 ? 'Encontramos estes carros com a placa ' : 'Encontramos este carro com a placa '));
      titulo.appendChild(RUMO.el('span', 'destaque', formatarPlaca(p.placa)));
      titulo.appendChild(document.createTextNode(estado.candidatos.length > 1 ? '. Qual é o seu?' : '. É o seu?'));
    } else {
      titulo.appendChild(document.createTextNode('Selecione a '));
      titulo.appendChild(RUMO.el('span', 'destaque', 'versão'));
      titulo.appendChild(document.createTextNode(' do seu carro.'));
    }
    estado.candidatos.forEach(function (c) {
      var label = RUMO.el('label', 'opcao');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'versao';
      input.value = c.id;
      input.checked = !!(estado.r.veiculo && estado.r.veiculo.id === c.id) || estado.candidatos.length === 1;
      var caixa = RUMO.el('span', 'opcao__caixa versao__caixa');
      caixa.appendChild(RUMO.el('span', 'versao__nome', c.marca + ' ' + c.versao + ', ' + c.ano));
      caixa.appendChild(RUMO.el('span', 'versao__fipe', 'Tabela: ' + RUMO.moeda(c.fipe)));
      label.appendChild(input);
      label.appendChild(caixa);
      lista.appendChild(label);
    });
  }

  function mostrarCaminhoPlaca(f) {
    var sabe = val(f, 'sabePlaca');
    $('#bloco-placa').hidden = sabe !== 'sim';
    $('#bloco-modelo').hidden = sabe !== 'nao';
  }

  function preencherSelect(sel, opcoes, rotuloVazio) {
    sel.textContent = '';
    sel.appendChild(new Option(rotuloVazio, ''));
    opcoes.forEach(function (o) { sel.appendChild(new Option(o, o)); });
  }

  function atualizarModelos(f) {
    var marca = f.elements.marca.value;
    var modelos = [];
    DADOS.veiculos.forEach(function (v) { if (v.marca === marca && modelos.indexOf(v.modelo) === -1) modelos.push(v.modelo); });
    preencherSelect(f.elements.modelo, modelos, marca ? 'Selecione' : 'Escolha a marca primeiro');
    f.elements.modelo.disabled = !marca;
  }

  function atualizarAnoModelo(f) {
    var fab = Number(f.elements.anoFab.value);
    var anos = fab ? [String(fab)] : [];
    if (fab && fab < 2027) anos.push(String(fab + 1));
    preencherSelect(f.elements.anoModelo, anos, fab ? 'Selecione' : 'Escolha o ano de fabricação');
    f.elements.anoModelo.disabled = !fab;
  }

  function buscarCep(input, silencioso) {
    var cep = digitos(input.value);
    if (cep.length !== 8) return;
    var form = input.form;
    var prefixo = input.id === 'cob-cep' ? 'cob-' : '';
    var achado = DADOS.ceps[cep];
    if (prefixo) {
      if (achado) {
        $('#cob-rua').value = achado.rua;
        $('#cob-cidade').value = achado.cidade;
        $('#cob-uf').value = achado.uf;
        RUMO.announce('Endereço encontrado: ' + achado.rua + ', ' + achado.cidade + '. Falta o número.');
      }
      return;
    }
    $('#bloco-endereco').hidden = false;
    if (achado) {
      form.elements.rua.value = achado.rua;
      form.elements.bairro.value = achado.bairro;
      form.elements.cidade.value = achado.cidade;
      form.elements.uf.value = achado.uf;
      if (!silencioso) RUMO.announce('Endereço encontrado: ' + achado.rua + ', ' + achado.bairro + ', ' + achado.cidade + '. Confira e informe o número.');
    } else if (!silencioso) {
      RUMO.announce('Não encontramos esse CEP. Preencha o endereço, por favor.');
    }
  }

  function atualizarFimVigencia() {
    var d = lerData($('#inicio').value);
    $('#fim-vigencia').textContent = d ? formatarData(maisUmAno(d)) : 'dd/mm/aaaa';
  }

  /* ------------------------------------------------------------ Aviso 18 a 25 */
  var seguirDepoisDoAviso = null;

  function abrirAvisoJovens(form, seguir) {
    seguirDepoisDoAviso = seguir;
    $('#ciente-jovens').checked = false;
    limparErro($('#ciente-jovens'));
    RUMO.abrirDialogo('dlg-jovens', form.querySelector('button[type="submit"]'));
  }

  function ligarAvisoJovens() {
    $('#form-jovens').addEventListener('submit', function (e) {
      e.preventDefault();
      var ciente = $('#ciente-jovens');
      if (!ciente.checked) {
        aplicarErros(this, [{ el: ciente, msg: 'Marque a confirmação para seguir sem essa cobertura.' }]);
        return;
      }
      estado.r.cienteJovens = true;
      var seguir = seguirDepoisDoAviso;
      seguirDepoisDoAviso = null;
      $('#dlg-jovens').close();
      if (seguir) seguir();
    });
    $('#ciente-jovens').addEventListener('change', function () { limparErro(this); });
    $('#jovens-mudar').addEventListener('click', function () {
      var form = $('.pergunta[data-p="jovens"] form');
      marcarRadio(form, 'jovens', 'sim');
      var seguir = seguirDepoisDoAviso;
      seguirDepoisDoAviso = null;
      $('#dlg-jovens').close();
      if (seguir) seguir();
    });
  }

  /* ------------------------------------------------------------ Fio da conversa */
  function perguntasVisiveis(etapa) { return PERGUNTAS[etapa].filter(visivel); }
  function proximaPendente(etapa) {
    var vis = perguntasVisiveis(etapa);
    for (var i = 0; i < vis.length; i++) if (!estado.feitas[vis[i]]) return vis[i];
    return '';
  }
  function etapaCompleta(etapa) {
    if (PERGUNTAS[etapa]) return !proximaPendente(etapa);
    if (etapa === 'cotacao') return !!estado.plano;
    return false;
  }

  function renderFio(etapa) {
    var secao = $('.etapa[data-etapa="' + etapa + '"]');
    var atual = estado.atual[etapa];
    $all('.pergunta', secao).forEach(function (li) {
      var p = li.getAttribute('data-p');
      var anterior = li.getAttribute('data-estado');
      var novo;
      if (!visivel(p)) novo = 'pendente';
      else if (p === atual) novo = 'atual';
      else if (estado.feitas[p]) novo = 'respondida';
      else novo = 'pendente';
      if (novo === 'respondida') $('.pergunta__resposta', li).textContent = Q[p].resumo();
      if (novo === 'atual' && anterior !== 'atual') {
        var form = $('form', li);
        $all('input, select', form).forEach(limparErro);
        form.removeAttribute('data-tentou');
        Q[p].preencher(form);
      }
      li.setAttribute('data-estado', novo);
    });
    atualizarNomes();
  }

  function focarPergunta(p) {
    var li = $('.pergunta[data-p="' + p + '"]');
    if (!li) return;
    var titulo = $('.cartao__pergunta', li);
    li.scrollIntoView({ block: 'center', behavior: RUMO.reduzMovimento() ? 'auto' : 'smooth' });
    titulo.focus({ preventScroll: true });
  }

  function abrirPergunta(p) {
    var etapa = PERGUNTAS.cliente.indexOf(p) !== -1 ? 'cliente' : 'veiculo';
    estado.atual[etapa] = p;
    renderFio(etapa);
    atualizarContador();
    salvar();
    focarPergunta(p);
  }

  function concluirPergunta(p, form) {
    var etapa = estado.etapa;
    Q[p].salvar(form);
    estado.feitas[p] = true;
    var proxima = proximaPendente(etapa);
    estado.atual[etapa] = proxima;
    renderFio(etapa);
    atualizarContador();
    salvar();
    if (proxima) {
      RUMO.announce('Resposta salva.');
      focarPergunta(proxima);
      return;
    }
    // Etapa respondida: segue para a próxima, ou volta para a confirmação se veio de lá.
    var destino = estado.voltarPara || ETAPAS[indiceEtapa(etapa) + 1];
    estado.voltarPara = '';
    irPara(destino);
  }

  function ligarPerguntas() {
    $all('.pergunta').forEach(function (li) {
      var p = li.getAttribute('data-p');
      var form = $('form', li);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!aplicarErros(form, Q[p].validar(form))) return;
        if (Q[p].antes) Q[p].antes(form, function () { concluirPergunta(p, form); });
        else concluirPergunta(p, form);
      });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-alterar]');
      if (b) abrirPergunta(b.getAttribute('data-alterar'));
    });

    var fPlaca = $('.pergunta[data-p="placa"] form');
    $all('input[name="sabePlaca"]', fPlaca).forEach(function (r) {
      r.addEventListener('change', function () { mostrarCaminhoPlaca(fPlaca); });
    });
    fPlaca.elements.placa.addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      try { this.setSelectionRange(pos, pos); } catch (err) { /* campo sem seleção */ }
    });
    preencherSelect(fPlaca.elements.marca, DADOS.veiculos.map(function (v) { return v.marca; }).filter(function (m, i, a) { return a.indexOf(m) === i; }).sort(), 'Selecione');
    var anos = [];
    for (var a = 2027; a >= 2008; a--) anos.push(String(a));
    preencherSelect(fPlaca.elements.anoFab, anos, 'Selecione');
    fPlaca.elements.marca.addEventListener('change', function () { atualizarModelos(fPlaca); });
    fPlaca.elements.anoFab.addEventListener('change', function () { atualizarAnoModelo(fPlaca); });

    $('#cep').addEventListener('input', function () { buscarCep(this, false); });
    $('#cob-cep').addEventListener('input', function () { buscarCep(this, false); });
    $('#inicio').addEventListener('input', atualizarFimVigencia);

    [$('#uf'), $('#cob-uf')].forEach(function (sel) {
      DADOS.ufs.forEach(function (uf) { sel.appendChild(new Option(uf, uf)); });
    });
  }

  /* ------------------------------------------------------------ Máscaras e erros ao digitar */
  function ligarCampos() {
    document.addEventListener('input', function (e) {
      var el = e.target;
      var m = el.getAttribute && el.getAttribute('data-mascara');
      if (m && MASCARAS[m]) el.value = MASCARAS[m](el.value);
      var form = el.form || el.closest('form');
      if (form && form.hasAttribute('data-tentou') && el.getAttribute('aria-invalid') === 'true') limparErro(el);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      var form = el.form || el.closest('form');
      if (form && form.hasAttribute('data-tentou') && el.getAttribute('aria-invalid') === 'true') limparErro(el);
    });
  }

  /* ------------------------------------------------------------ Estrada e etapas */
  function atualizarEstrada(anterior) {
    var idx = indiceEtapa(estado.etapa);
    var estrada = $('.estrada');
    estrada.style.setProperty('--pos', (idx * 25) + '%');
    if (anterior !== undefined && anterior !== idx && !RUMO.reduzMovimento()) {
      estrada.classList.toggle('estrada--re', idx < anterior);
      estrada.classList.add('estrada--andando');
      window.clearTimeout(andandoTimer);
      andandoTimer = window.setTimeout(function () {
        estrada.classList.remove('estrada--andando', 'estrada--re');
      }, 950);
    }
    $all('.parada').forEach(function (b, i) {
      var feita = i < estado.maxEtapa || (i <= estado.maxEtapa && i !== idx && etapaCompleta(ETAPAS[i]));
      b.classList.toggle('parada--atual', i === idx);
      b.classList.toggle('parada--feita', feita && i !== idx);
      b.disabled = i > estado.maxEtapa;
      if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      $('.parada__estado', b).textContent = i === idx ? ', etapa atual' : (b.disabled ? ', ainda não liberada' : ', concluída');
    });
  }

  function atualizarContador() {
    var etapa = estado.etapa;
    var texto = $('#contador-texto');
    var cont = $('#contador');
    texto.textContent = '';
    var completo = false, progresso = 0;
    if (PERGUNTAS[etapa]) {
      var vis = perguntasVisiveis(etapa);
      var n = vis.filter(function (p) { return estado.feitas[p]; }).length;
      texto.appendChild(RUMO.el('strong', '', String(n)));
      texto.appendChild(document.createTextNode(' de ' + vis.length + ' respondidas'));
      completo = n === vis.length;
      progresso = Math.round(n / vis.length * 100);
    } else if (etapa === 'cotacao') {
      if (estado.plano) {
        texto.appendChild(document.createTextNode('Plano '));
        texto.appendChild(RUMO.el('strong', '', nomeDoPlano(estado.plano)));
        completo = true; progresso = 100;
      } else {
        texto.textContent = 'Nenhum plano escolhido';
      }
    } else if (etapa === 'confirmacao') {
      texto.textContent = 'Quase lá';
      progresso = 50;
    } else {
      texto.textContent = 'Último passo';
      progresso = 90;
    }
    cont.classList.toggle('contador--completo', completo);
    $('#contador-barra').parentNode.style.setProperty('--progresso', progresso + '%');
  }

  function atualizarNomes() {
    var nome = primeiroNome();
    $all('[data-primeiro-nome]').forEach(function (s) { s.textContent = nome || 'Você'; });
  }

  function irPara(etapa, opcoes) {
    opcoes = opcoes || {};
    var anterior = indiceEtapa(estado.etapa);
    var idx = indiceEtapa(etapa);
    estado.etapa = etapa;
    estado.maxEtapa = Math.max(estado.maxEtapa, idx);
    if (etapa === 'confirmacao') estado.voltarPara = '';

    $all('.etapa').forEach(function (s) { s.hidden = s.getAttribute('data-etapa') !== etapa; });
    $('#titulo-etapa').textContent = TITULOS[etapa];
    document.title = TITULOS[etapa] + ' (etapa ' + (idx + 1) + ' de 5) | Rumo Auto';

    if (PERGUNTAS[etapa]) {
      if (!estado.atual[etapa] && !etapaCompleta(etapa)) estado.atual[etapa] = proximaPendente(etapa);
      renderFio(etapa);
    }
    if (etapa === 'cotacao') renderCotacao(true);
    if (etapa === 'confirmacao') renderConfirmacao();
    if (etapa === 'pagamento') renderPagamento();

    $('#btn-anterior').hidden = idx === 0;
    $('#btn-proxima-texto').textContent = etapa === 'pagamento' ? 'Contratar seguro' : (etapa === 'confirmacao' ? 'Ir para o pagamento' : 'Próxima etapa');
    atualizarEstrada(anterior);
    atualizarContador();
    atualizarNomes();
    salvar();

    if (opcoes.semFoco) return;
    window.scrollTo({ top: 0, behavior: RUMO.reduzMovimento() ? 'auto' : 'smooth' });
    // Ao entrar numa etapa de perguntas, o foco vai direto para a pergunta aberta.
    var aberta = PERGUNTAS[etapa] && estado.atual[etapa];
    if (aberta && opcoes.focarPergunta !== false) {
      $('#titulo-etapa').focus({ preventScroll: true });
      RUMO.announce(TITULOS[etapa] + ', etapa ' + (idx + 1) + ' de 5.');
      window.setTimeout(function () { focarPergunta(aberta); }, 350);
    } else {
      $('#titulo-etapa').focus({ preventScroll: true });
    }
  }

  function avancar() {
    var etapa = estado.etapa;
    if (PERGUNTAS[etapa]) {
      var falta = proximaPendente(etapa);
      if (falta) {
        if (estado.atual[etapa] !== falta) { estado.atual[etapa] = falta; renderFio(etapa); }
        RUMO.announce('Ainda falta responder esta pergunta.');
        focarPergunta(falta);
        return;
      }
      return irPara(ETAPAS[indiceEtapa(etapa) + 1]);
    }
    if (etapa === 'cotacao') {
      if (!estado.plano) {
        RUMO.announce('Escolha um plano para continuar.');
        var primeiro = $('.btn--plano');
        if (primeiro) primeiro.focus();
        return;
      }
      return irPara('confirmacao');
    }
    if (etapa === 'confirmacao') {
      if (!validarCobranca()) return;
      if (!estado.logado) { abrirLogin(); return; }
      return irPara('pagamento');
    }
    if (etapa === 'pagamento') contratar();
  }

  function voltar() {
    var idx = indiceEtapa(estado.etapa);
    if (idx > 0) irPara(ETAPAS[idx - 1], { focarPergunta: false });
  }

  /* ------------------------------------------------------------ Cotação */
  var rolagemPlanosLigada = false;

  function animarPreco(elInteiro, valor) {
    var alvo = Math.floor(valor);
    if (RUMO.reduzMovimento()) { elInteiro.textContent = RUMO.inteiro(alvo); return; }
    var inicio = null, duracao = 800;
    function passo(t) {
      if (inicio === null) inicio = t;
      var p = Math.min(1, (t - inicio) / duracao);
      var suave = 1 - Math.pow(1 - p, 3);
      elInteiro.textContent = RUMO.inteiro(Math.round(alvo * suave));
      if (p < 1) window.requestAnimationFrame(passo);
    }
    window.requestAnimationFrame(passo);
  }

  function montarPreco(valor, animar) {
    var partes = separarPreco(valor);
    var p = RUMO.el('p', 'preco');
    p.appendChild(RUMO.el('span', 'preco__moeda', 'R$'));
    var inteiro = RUMO.el('span', 'preco__inteiro', RUMO.inteiro(partes.inteiro));
    p.appendChild(inteiro);
    p.appendChild(RUMO.el('span', 'preco__centavos', partes.centavos));
    p.appendChild(RUMO.el('span', 'preco__periodo', 'por mês'));
    if (animar) animarPreco(inteiro, partes.inteiro);
    return p;
  }

  function montarPlano(id, nome, frase, destaque, animar) {
    var niveis = niveisDoPlano(id);
    var preco = precoMensal(niveis);
    var li = RUMO.el('li', 'plano' + (destaque ? ' plano--destaque' : '') + (estado.plano === id ? ' plano--escolhido' : ''));
    li.setAttribute('data-plano', id);
    var art = RUMO.el('article', 'plano__caixa');
    art.setAttribute('aria-labelledby', 'plano-' + id + '-nome');
    var topo = RUMO.el('div', 'plano__topo');
    if (destaque) topo.appendChild(RUMO.el('p', 'plano__selo', 'Mais escolhido'));
    var h = RUMO.el('h3', 'plano__nome', nome);
    h.id = 'plano-' + id + '-nome';
    topo.appendChild(h);
    topo.appendChild(RUMO.el('p', 'plano__frase', frase));
    topo.appendChild(montarPreco(preco, animar));
    var b = RUMO.el('button', 'btn btn--plano');
    b.type = 'button';
    if (id === 'personalizado') {
      b.textContent = estado.plano === id ? 'Ajustar coberturas' : 'Personalizar';
      b.setAttribute('data-personalizar', '');
    } else {
      b.setAttribute('data-escolher', id);
      b.setAttribute('aria-pressed', String(estado.plano === id));
      b.appendChild(document.createTextNode(estado.plano === id ? 'Escolhido' : 'Escolher'));
      b.appendChild(RUMO.el('span', 'visually-hidden', ' o plano ' + nome));
    }
    topo.appendChild(b);
    art.appendChild(topo);

    var ul = RUMO.el('ul', 'plano__coberturas');
    ul.setAttribute('aria-label', 'Coberturas do plano ' + nome);
    DADOS.coberturas.forEach(function (c) {
      var t = textoCobertura(c, niveis);
      var linha = RUMO.el('li', 'plano__linha' + (t.tipo ? ' plano__linha--' + t.tipo : ''));
      linha.appendChild(RUMO.el('span', 'plano__linha-nome', c.nome + ': '));
      linha.appendChild(RUMO.el('span', 'plano__linha-valor', t.texto));
      ul.appendChild(linha);
    });
    art.appendChild(ul);
    li.appendChild(art);
    return li;
  }

  function renderCotacao(animar) {
    var v = estado.r.veiculo;
    if (!v) return;
    $('#fipe-valor').textContent = RUMO.moeda(v.fipe);
    $('#fipe-nota').textContent = v.marca + ' ' + v.versao + ', ' + v.ano + ', pela tabela de referência de ' + DADOS.mesTabela + '.';

    var ajustes = $('#ajustes');
    ajustes.textContent = '';
    var fatores = fatoresDeRisco();
    if (!fatores.length) ajustes.appendChild(RUMO.el('li', 'ajuste', 'Nenhum ajuste no seu perfil'));
    fatores.forEach(function (f) {
      var pct = Math.round((f.mult - 1) * 100);
      var texto = f.rotulo + (pct === 0 ? ': sem ajuste' : (pct < 0 ? ': ' + Math.abs(pct) + '% mais barato' : ': ' + pct + '% mais caro'));
      ajustes.appendChild(RUMO.el('li', 'ajuste' + (pct < 0 ? ' ajuste--bom' : (pct > 0 ? ' ajuste--pesa' : '')), texto));
    });

    var rotulos = $('#rotulos-coberturas');
    rotulos.textContent = '';
    DADOS.coberturas.forEach(function (c) { rotulos.appendChild(RUMO.el('li', '', c.nome)); });

    var trilho = $('#trilho-planos');
    trilho.textContent = '';
    DADOS.planos.forEach(function (p) { trilho.appendChild(montarPlano(p.id, p.nome, p.frase, p.destaque, animar)); });
    trilho.appendChild(montarPlano('personalizado', 'Personalizado', 'Pague só pelo que achar necessário.', false, animar));

    var gl = $('#glossario');
    if (!gl.children.length) {
      DADOS.coberturas.forEach(function (c) {
        var div = document.createElement('div');
        div.appendChild(RUMO.el('dt', '', c.nome));
        div.appendChild(RUMO.el('dd', '', c.descricao));
        gl.appendChild(div);
      });
    }
    ligarRolagemPlanos();
    atualizarSetas();
  }

  function atualizarSetas() {
    var t = $('#trilho-planos');
    $('#planos-anterior').disabled = t.scrollLeft <= 4;
    $('#planos-proximo').disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4;
  }

  function ligarRolagemPlanos() {
    if (rolagemPlanosLigada) return;
    rolagemPlanosLigada = true;
    var t = $('#trilho-planos');
    function passo() { var item = $('.plano', t); return item ? item.getBoundingClientRect().width + 16 : 260; }
    $('#planos-anterior').addEventListener('click', function () { t.scrollBy({ left: -passo(), behavior: RUMO.reduzMovimento() ? 'auto' : 'smooth' }); });
    $('#planos-proximo').addEventListener('click', function () { t.scrollBy({ left: passo(), behavior: RUMO.reduzMovimento() ? 'auto' : 'smooth' }); });
    t.addEventListener('scroll', atualizarSetas, { passive: true });
    window.addEventListener('resize', atualizarSetas);
    // Quem navega pelo teclado vê o plano focado inteiro.
    t.addEventListener('focusin', function (e) {
      var item = e.target.closest('.plano');
      if (item) item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: RUMO.reduzMovimento() ? 'auto' : 'smooth' });
    });
    t.addEventListener('click', function (e) {
      var b = e.target.closest('[data-escolher]');
      if (b) escolherPlano(b.getAttribute('data-escolher'));
      if (e.target.closest('[data-personalizar]')) abrirPersonalizar(e.target.closest('[data-personalizar]'));
    });
  }

  function escolherPlano(id) {
    estado.plano = id;
    $all('#trilho-planos .plano').forEach(function (li) {
      var esse = li.getAttribute('data-plano') === id;
      li.classList.toggle('plano--escolhido', esse);
      var b = $('[data-escolher]', li);
      if (b) {
        b.setAttribute('aria-pressed', String(esse));
        b.firstChild.textContent = esse ? 'Escolhido' : 'Escolher';
      }
      var p = $('[data-personalizar]', li);
      if (p) p.textContent = esse ? 'Ajustar coberturas' : 'Personalizar';
    });
    atualizarContador();
    atualizarEstrada();
    salvar();
    RUMO.announce('Plano ' + nomeDoPlano(id) + ' escolhido, ' + RUMO.moeda(precoMensal(niveisDoPlano(id))) + ' por mês. Siga para a confirmação quando quiser.');
  }

  /* ------------------------------------------------------------ Personalizar */
  var rascunhoPersonalizado = null;

  function abrirPersonalizar(origem) {
    rascunhoPersonalizado = copia(niveisDoPlano('personalizado'));
    var box = $('#personalizar-campos');
    box.textContent = '';
    DADOS.coberturas.forEach(function (c) {
      if (c.fixa) return;
      var campo = RUMO.el('div', 'campo');
      var id = 'pers-' + c.id;
      var label = RUMO.el('label', 'campo__rotulo', c.nome);
      label.htmlFor = id;
      var sel = RUMO.el('select', 'campo__input campo__select');
      sel.id = id;
      c.niveis.forEach(function (n, i) {
        if (c.id === 'franquia' && i === 0) return;
        sel.appendChild(new Option(n.rotulo, String(i)));
      });
      sel.value = String(rascunhoPersonalizado[c.id] || (c.id === 'franquia' ? 1 : 0));
      sel.addEventListener('change', function () {
        rascunhoPersonalizado[c.id] = Number(sel.value);
        atualizarFranquiaPersonalizada();
        atualizarPrecoPersonalizado();
      });
      campo.appendChild(label);
      campo.appendChild(sel);
      box.appendChild(campo);
    });
    atualizarFranquiaPersonalizada();
    atualizarPrecoPersonalizado();
    RUMO.abrirDialogo('dlg-personalizar', origem);
  }

  function atualizarFranquiaPersonalizada() {
    var sel = $('#pers-franquia');
    var semColisao = !rascunhoPersonalizado.colisao;
    sel.disabled = semColisao;
    if (semColisao) rascunhoPersonalizado.franquia = 0;
    else if (!rascunhoPersonalizado.franquia) rascunhoPersonalizado.franquia = Number(sel.value) || 1;
  }

  function atualizarPrecoPersonalizado() {
    var partes = separarPreco(precoMensal(rascunhoPersonalizado));
    $('#pers-inteiro').textContent = RUMO.inteiro(partes.inteiro);
    $('#pers-centavos').textContent = partes.centavos;
  }

  function ligarPersonalizar() {
    $('#form-personalizar').addEventListener('submit', function (e) {
      e.preventDefault();
      estado.personalizado = copia(rascunhoPersonalizado);
      estado.plano = 'personalizado';
      $('#dlg-personalizar').close();
      renderCotacao(false);
      escolherPlano('personalizado');
      var b = $('[data-personalizar]');
      if (b) b.focus();
    });
  }

  /* ------------------------------------------------------------ Confirmação */
  function ladrilho(rotulo, valor, largo) {
    var d = RUMO.el('div', 'ladrilho' + (largo ? ' ladrilho--largo' : ''));
    d.appendChild(RUMO.el('dt', '', rotulo));
    d.appendChild(RUMO.el('dd', '', valor));
    return d;
  }

  function grupo(icone, titulo, itens, destino, rotuloAlterar) {
    var sec = RUMO.el('section', 'grupo');
    var id = 'grupo-' + destino + '-' + titulo.replace(/\W+/g, '').toLowerCase();
    sec.setAttribute('aria-labelledby', id);
    var topo = RUMO.el('div', 'grupo__topo');
    var ic = RUMO.el('span', 'grupo__icone');
    ic.appendChild(RUMO.icon(icone));
    topo.appendChild(ic);
    var h = RUMO.el('h2', 'grupo__titulo', titulo);
    h.id = id;
    topo.appendChild(h);
    var b = RUMO.el('button', 'link-alterar');
    b.type = 'button';
    b.setAttribute('data-voltar', destino);
    b.appendChild(RUMO.icon('editar'));
    b.appendChild(document.createTextNode('Alterar'));
    b.appendChild(RUMO.el('span', 'visually-hidden', ' ' + rotuloAlterar));
    topo.appendChild(b);
    sec.appendChild(topo);
    var dl = RUMO.el('dl', 'ladrilhos');
    itens.forEach(function (i) { dl.appendChild(i); });
    sec.appendChild(dl);
    return sec;
  }

  function renderConfirmacao() {
    var r = estado.r, box = $('#conferir');
    box.textContent = '';
    var c = r.contato;
    box.appendChild(grupo('pessoa', 'Você', [
      ladrilho('Nome', c.nome, true),
      ladrilho('Celular', c.telefone),
      ladrilho('E-mail', c.email, true),
      ladrilho('CPF', r.cpf),
      ladrilho('Nascimento', r.nascimento),
      ladrilho('Estado civil', NOMES_ESTADO_CIVIL[r.estadoCivil]),
      ladrilho('Sexo', r.sexo === 'feminino' ? 'Feminino' : 'Masculino'),
      ladrilho('Motoristas de 18 a 25 anos', r.jovens === 'sim' ? 'Incluídos na cobertura' : 'Não incluídos', true),
      ladrilho('Principal motorista', r.principal === 'sim' ? 'Você' : r.motorista.nome)
    ], 'cliente', 'seus dados'));
    if (r.principal === 'nao') {
      var m = r.motorista;
      box.appendChild(grupo('pessoa', 'Principal motorista', [
        ladrilho('Nome', m.nome, true),
        ladrilho('CPF', m.cpf),
        ladrilho('Nascimento', m.nascimento),
        ladrilho('Relação', NOMES_RELACAO[m.relacao]),
        ladrilho('Estado civil', NOMES_ESTADO_CIVIL[m.estadoCivil])
      ], 'cliente', 'dados do principal motorista'));
    }
    var v = r.veiculo;
    box.appendChild(grupo('carro', 'Seu carro', [
      ladrilho('Carro', v.marca + ' ' + v.versao, true),
      ladrilho('Ano', String(v.ano)),
      ladrilho('Placa', r.placa.sabe === 'sim' ? formatarPlaca(r.placa.placa) : 'Informada depois'),
      ladrilho('Uso', NOMES_USO[r.uso]),
      ladrilho('À noite', NOMES_PERNOITE[r.pernoite]),
      ladrilho('Onde dorme', textoEndereco(r.endereco), true),
      ladrilho('Particularidades', textoDetalhes(r.detalhes), true),
      ladrilho('Vigência', textoVigencia())
    ], 'veiculo', 'dados do carro'));
    var niveis = niveisDoPlano(estado.plano);
    box.appendChild(grupo('escudo', 'Plano escolhido', [
      ladrilho('Plano', nomeDoPlano(estado.plano)),
      ladrilho('Mensalidade', RUMO.moeda(precoMensal(niveis))),
      ladrilho('Franquia', textoCobertura(cobertura('franquia'), niveis).texto),
      ladrilho('Colisão', textoCobertura(cobertura('colisao'), niveis).texto),
      ladrilho('Danos a terceiros', textoCobertura(cobertura('terceiros'), niveis).texto),
      ladrilho('Assistência 24 horas', textoCobertura(cobertura('assistencia'), niveis).texto)
    ], 'cotacao', 'plano'));

    $('#endereco-atual').textContent = textoEndereco(r.endereco);
    var f = $('#form-cobranca');
    var cob = estado.cobranca || {};
    marcarRadio(f, 'mesmoEndereco', cob.mesmoEndereco);
    ['cobCep', 'cobNumero', 'cobRua', 'cobCidade', 'cobUf'].forEach(function (k) { f.elements[k].value = cob[k] || ''; });
    $('#bloco-cobranca').hidden = cob.mesmoEndereco !== 'nao';
  }

  function lerCobranca() {
    var f = $('#form-cobranca');
    var cob = { mesmoEndereco: val(f, 'mesmoEndereco') };
    ['cobCep', 'cobNumero', 'cobRua', 'cobCidade', 'cobUf'].forEach(function (k) { cob[k] = val(f, k); });
    estado.cobranca = cob;
    salvar();
    return cob;
  }

  function validarCobranca() {
    var f = $('#form-cobranca');
    var cob = lerCobranca();
    var e = [];
    if (!cob.mesmoEndereco) exigirRadio(f, 'mesmoEndereco', 'Responda se o endereço de cobrança é o mesmo.', e);
    if (cob.mesmoEndereco === 'nao') {
      if (digitos(cob.cobCep).length !== 8) e.push({ el: f.elements.cobCep, msg: 'Informe um CEP com 8 números.' });
      if (!cob.cobNumero) e.push({ el: f.elements.cobNumero, msg: 'Informe o número.' });
      if (!cob.cobRua) e.push({ el: f.elements.cobRua, msg: 'Informe a rua.' });
      if (!cob.cobCidade) e.push({ el: f.elements.cobCidade, msg: 'Informe a cidade.' });
      if (!cob.cobUf) e.push({ el: f.elements.cobUf, msg: 'Escolha o estado.' });
    }
    if (e.length) $('#form-cobranca').scrollIntoView({ block: 'center' });
    return aplicarErros(f, e);
  }

  function ligarConfirmacao() {
    var f = $('#form-cobranca');
    $all('input[name="mesmoEndereco"]', f).forEach(function (r) {
      r.addEventListener('change', function () {
        $('#bloco-cobranca').hidden = r.value !== 'nao' || !r.checked;
        lerCobranca();
      });
    });
    f.addEventListener('submit', function (e) { e.preventDefault(); avancar(); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-voltar]');
      if (!b) return;
      var destino = b.getAttribute('data-voltar');
      estado.voltarPara = destino === 'cotacao' ? '' : 'confirmacao';
      irPara(destino, { focarPergunta: false });
      if (estado.voltarPara) RUMO.announce('Use o botão Alterar na resposta que quer mudar. Depois de salvar, você volta para a confirmação.');
    });
  }

  /* ------------------------------------------------------------ Login */
  function abrirLogin() {
    var c = estado.r.contato || {};
    $('#login-email').value = c.email || '';
    $('#cad-nome').value = c.nome || '';
    $('#cad-email').value = c.email || '';
    mostrarCadastro(false);
    RUMO.abrirDialogo('dlg-login', $('#btn-proxima'));
  }

  function mostrarCadastro(sim) {
    $('#form-login').hidden = sim;
    $('#form-cadastro').hidden = !sim;
    $('#dlg-login-titulo').textContent = sim ? 'Crie sua conta para concluir' : 'Para concluir, entre na sua conta';
  }

  function entrou() {
    estado.logado = true;
    $('#dlg-login').close();
    RUMO.announce('Pronto, você entrou.');
    irPara('pagamento');
  }

  function ligarLogin() {
    $('#entrar-onda').addEventListener('click', entrou);
    $('#ir-cadastro').addEventListener('click', function () { mostrarCadastro(true); $('#cad-nome').focus(); });
    $('#ir-login').addEventListener('click', function () { mostrarCadastro(false); $('#login-email').focus(); });
    $('#form-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var erros = [], email = $('#login-email'), senha = $('#login-senha');
      if (!emailValido(email.value)) erros.push({ el: email, msg: 'Informe um e-mail válido.' });
      if (senha.value.length < 6) erros.push({ el: senha, msg: 'A senha tem pelo menos 6 caracteres.' });
      if (aplicarErros(this, erros)) { senha.value = ''; entrou(); }
    });
    $('#form-cadastro').addEventListener('submit', function (e) {
      e.preventDefault();
      var erros = [], nome = $('#cad-nome'), email = $('#cad-email'), senha = $('#cad-senha');
      validarNome(nome, erros, 'o seu nome completo');
      if (!emailValido(email.value)) erros.push({ el: email, msg: 'Informe um e-mail válido.' });
      if (senha.value.length < 8 || !/[a-zA-Z]/.test(senha.value) || !/\d/.test(senha.value)) erros.push({ el: senha, msg: 'Use pelo menos 8 caracteres, com letras e números.' });
      if (aplicarErros(this, erros)) { senha.value = ''; entrou(); }
    });
  }

  /* ------------------------------------------------------------ Pagamento */
  function renderPagamento() {
    var preco = precoMensal(niveisDoPlano(estado.plano));
    var partes = separarPreco(preco);
    $('#pag-plano').textContent = 'Plano ' + nomeDoPlano(estado.plano);
    $('#pag-inteiro').textContent = RUMO.inteiro(partes.inteiro);
    $('#pag-centavos').textContent = partes.centavos;
    $('#pag-vigencia').textContent = textoVigencia();
    var v = estado.r.veiculo;
    $('#pag-carro').textContent = v.marca + ' ' + v.modelo + ' ' + v.ano;
    if (!$('#cartao-nome').value) $('#cartao-nome').value = (estado.r.contato.nome || '').toUpperCase();
    atualizarCartaoVisual();
  }

  function atualizarCartaoVisual() {
    var num = $('#cartao-numero').value;
    var b = bandeira(num);
    $('#cartao-3d').setAttribute('data-bandeira', b);
    $('#cv-bandeira').textContent = b ? NOMES_BANDEIRA[b] : 'Bandeira';
    var d = digitos(num);
    var mostrado = (d + '0000000000000000'.slice(d.length)).replace(/(\d{4})(?=\d)/g, '$1 ');
    $('#cv-numero').textContent = mostrado;
    $('#cv-validade').textContent = $('#cartao-validade').value || '00/00';
    $('#cv-nome').textContent = $('#cartao-nome').value || 'Nome do titular';
    $('#cv-cvv').textContent = $('#cartao-cvv').value.replace(/./g, '•') || '000';
    var dica = $('#bandeira-texto');
    var texto = b ? 'Bandeira: ' + NOMES_BANDEIRA[b] + '.' : 'A bandeira aparece sozinha. Para testar, use 4111 1111 1111 1111.';
    if (dica.textContent !== texto) dica.textContent = texto;
  }

  function validarPagamento() {
    var f = $('#form-pagamento');
    var e = [];
    var num = $('#cartao-numero'), nome = $('#cartao-nome'), val2 = $('#cartao-validade'), cvv = $('#cartao-cvv');
    var d = digitos(num.value);
    if (!d) e.push({ el: num, msg: 'Informe o número do cartão.' });
    else if (d.length < 13 || !luhn(d)) e.push({ el: num, msg: 'Esse número de cartão não é válido. Confira os dígitos.' });
    if (nome.value.trim().length < 3) e.push({ el: nome, msg: 'Informe o nome como está no cartão.' });
    var m = /^(\d{2})\/(\d{2})$/.exec(val2.value);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.push({ el: val2, msg: 'Use mês e ano, como 08/29.' });
    else {
      var fim = new Date(2000 + Number(m[2]), Number(m[1]), 1);
      if (fim <= new Date()) e.push({ el: val2, msg: 'Esse cartão está vencido.' });
    }
    var tamanho = bandeira(num.value) === 'amex' ? 4 : 3;
    if (digitos(cvv.value).length !== tamanho) e.push({ el: cvv, msg: 'O código de segurança tem ' + tamanho + ' números.' });
    if (!$('#aceite').checked) e.push({ el: $('#aceite'), msg: 'Para contratar, marque que concorda com as condições.' });
    return aplicarErros(f, e);
  }

  function ligarPagamento() {
    ['#cartao-numero', '#cartao-nome', '#cartao-validade', '#cartao-cvv'].forEach(function (s) {
      $(s).addEventListener('input', atualizarCartaoVisual);
    });
    $('#cartao-cvv').addEventListener('input', function () { this.value = digitos(this.value).slice(0, 4); atualizarCartaoVisual(); });
    $('#cartao-cvv').addEventListener('focus', function () { $('#cartao-3d').classList.add('cartao-3d--verso'); });
    $('#cartao-cvv').addEventListener('blur', function () { $('#cartao-3d').classList.remove('cartao-3d--verso'); });
    $('#aceite').addEventListener('change', function () { limparErro(this); });
    $('#form-pagamento').addEventListener('submit', function (e) { e.preventDefault(); avancar(); });
  }

  function contratar() {
    if (!validarPagamento()) return;
    var v = estado.r.veiculo;
    var inicio = lerData(estado.r.inicio);
    var sorteio = new Uint32Array(1);
    window.crypto.getRandomValues(sorteio);
    var numero = '0420.26.' + String(10000 + (sorteio[0] % 90000));
    var preco = precoMensal(niveisDoPlano(estado.plano));
    var apolice = {
      numero: numero,
      carro: v.marca + ' ' + v.modelo,
      ano: v.ano,
      placa: estado.r.placa.sabe === 'sim' ? formatarPlaca(estado.r.placa.placa) : '',
      plano: nomeDoPlano(estado.plano),
      inicio: formatarData(inicio),
      fim: formatarData(maisUmAno(inicio)),
      mensal: preco,
      nova: true
    };
    var lista = apolicesNovas();
    lista.unshift(apolice);
    RUMO.store.set('apolices', lista);
    ultimaApolice = apolice;

    // Os dados do cartão saem da tela e o rascunho é apagado.
    $('#form-pagamento').reset();
    atualizarCartaoVisual();
    RUMO.store.remove('rascunho');
    estado.maxEtapa = 4;
    $all('.parada').forEach(function (b) { b.classList.add('parada--feita'); });

    $('#sucesso-texto').textContent = primeiroNome() + ', seu ' + apolice.carro + ' já está protegido. Enviamos a apólice para ' + estado.r.contato.email + '.';
    $('#sucesso-apolice').textContent = numero;
    $('#sucesso-vigencia').textContent = apolice.inicio + ' a ' + apolice.fim;
    $('#sucesso-mensal').textContent = RUMO.moeda(preco);
    RUMO.abrirDialogo('dlg-sucesso', $('#btn-proxima'));
    $('#dlg-sucesso-titulo').focus();
  }

  var ultimaApolice = null;

  function baixarComprovante() {
    var a = ultimaApolice;
    if (!a) return;
    var linhas = [
      'RUMO SEGUROS (marca fictícia, documento de demonstração)',
      '',
      'Comprovante de contratação do seguro auto',
      'Apólice: ' + a.numero,
      'Segurado(a): ' + estado.r.contato.nome,
      'Carro: ' + a.carro + ' ' + a.ano + (a.placa ? ', placa ' + a.placa : ''),
      'Plano: ' + a.plano,
      'Vigência: ' + a.inicio + ' a ' + a.fim,
      'Mensalidade: ' + RUMO.moeda(a.mensal),
      '',
      'Este arquivo foi gerado no seu navegador e não tem valor legal.'
    ];
    var blob = new Blob([linhas.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'comprovante-' + a.numero.replace(/\./g, '-') + '.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    RUMO.announce('Comprovante baixado.');
  }

  /* ------------------------------------------------------------ Entrada */
  function saudacao() {
    var h = new Date().getHours();
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  }

  function veiculoPorId(id) {
    for (var i = 0; i < DADOS.veiculos.length; i++) if (DADOS.veiculos[i].id === id) return DADOS.veiculos[i];
    return null;
  }

  function bloco(icone, titulo, sub, meta, status, classe) {
    var b = RUMO.el('button', 'bloco' + (classe ? ' ' + classe : ''));
    b.type = 'button';
    var ic = RUMO.el('span', 'bloco__icone');
    ic.appendChild(RUMO.icon(icone));
    b.appendChild(ic);
    var t = RUMO.el('span', 'bloco__texto');
    t.appendChild(RUMO.el('span', 'bloco__titulo', titulo));
    if (sub) t.appendChild(RUMO.el('span', 'bloco__sub', sub));
    if (meta) t.appendChild(RUMO.el('span', 'bloco__meta', meta));
    b.appendChild(t);
    if (status) b.appendChild(RUMO.el('span', 'bloco__status', status));
    return b;
  }

  function renderEntrada() {
    $('#saudacao').textContent = saudacao();
    $('#nome-entrada').textContent = DADOS.cliente.primeiroNome;

    var lc = $('#lista-cotacoes');
    $all('.blocos__item--dinamico', lc).forEach(function (li) { li.remove(); });
    var itens = [];
    var rasc = RUMO.store.get('rascunho', null);
    if (temRascunho()) {
      var b = bloco('carro', 'Continuar cotação', 'Parou em: ' + TITULOS[rasc.etapa], 'Seus dados estão guardados nesta aba', '', 'bloco--continuar');
      b.addEventListener('click', function () { carregarRascunho(); mostrarFluxo(); });
      itens.push(b);
    }
    DADOS.cotacoesSalvas.forEach(function (c) {
      var v = veiculoPorId(c.veiculo);
      var b = bloco('carro', v.modelo + ' ' + v.ano, v.marca + ', cotação de ' + c.data, 'Plano ' + c.plano + ', ' + RUMO.moeda(c.mensal) + ' por mês');
      b.addEventListener('click', function () { retomarCotacao(c); });
      itens.push(b);
    });
    // "Fazer nova cotação" fica sempre em primeiro: é a ação principal da tela.
    itens.forEach(function (b) {
      var li = RUMO.el('li', 'blocos__item blocos__item--dinamico');
      li.appendChild(b);
      lc.appendChild(li);
    });

    var la = $('#lista-apolices');
    la.textContent = '';
    var todas = apolicesNovas().concat(DADOS.apolicesSalvas.map(function (a) {
      var v = veiculoPorId(a.veiculo);
      return { numero: a.numero, carro: v.marca + ' ' + v.modelo, ano: v.ano, placa: formatarPlaca(a.placa), plano: a.plano, inicio: a.inicio, fim: a.fim, mensal: a.mensal };
    }));
    todas.forEach(function (a) {
      var li = RUMO.el('li', 'blocos__item');
      var b = bloco('escudo', a.carro.split(' ').slice(1).join(' ') + ' ' + a.ano, a.carro.split(' ')[0] + ', plano ' + a.plano, 'Vigente até ' + a.fim, a.nova ? 'Nova' : 'Vigente', a.nova ? 'bloco--nova-apolice' : '');
      b.addEventListener('click', function () { abrirApolice(a, b); });
      li.appendChild(b);
      la.appendChild(li);
    });
  }

  function abrirApolice(a, origem) {
    $('#dlg-apolice-titulo').textContent = 'Apólice ' + a.numero;
    var dl = $('#ficha-apolice');
    dl.textContent = '';
    [['Carro', a.carro + ' ' + a.ano], ['Placa', a.placa || 'A informar'], ['Plano', a.plano], ['Mensalidade', RUMO.moeda(a.mensal)],
      ['Início', a.inicio], ['Fim', a.fim]].forEach(function (par) {
      var d = document.createElement('div');
      d.appendChild(RUMO.el('dt', '', par[0]));
      d.appendChild(RUMO.el('dd', '', par[1]));
      dl.appendChild(d);
    });
    RUMO.abrirDialogo('dlg-apolice', origem);
  }

  function mostrarEntrada(focarNova) {
    estado.tela = 'entrada';
    if (temRascunho() || estado.r.contato) salvar();
    renderEntrada();
    $('#tela-fluxo').hidden = true;
    $('#tela-entrada').hidden = false;
    $('#pular').setAttribute('href', '#entrada-conteudo');
    document.title = 'Início | Rumo Auto';
    window.scrollTo(0, 0);
    var nova = focarNova && $('.bloco--nova-apolice');
    (nova || $('#entrada-conteudo')).focus();
  }

  function mostrarFluxo(etapa) {
    estado.tela = 'fluxo';
    $('#tela-entrada').hidden = true;
    $('#tela-fluxo').hidden = false;
    $('#pular').setAttribute('href', '#conteudo');
    irPara(etapa || estado.etapa);
  }

  function carregarRascunho() {
    var s = RUMO.store.get('rascunho', null);
    estado = estadoInicial();
    if (!s) return;
    Object.keys(s).forEach(function (k) { estado[k] = s[k]; });
  }

  function novaCotacao() {
    RUMO.store.remove('rascunho');
    estado = estadoInicial();
    $all('.pergunta').forEach(function (li) { li.removeAttribute('data-estado'); });
    $('#form-cobranca').reset();
    $('#form-pagamento').reset();
    mostrarFluxo('cliente');
  }

  // Abre uma cotação antiga direto na escolha de plano, com o perfil de exemplo.
  function retomarCotacao(c) {
    estado = estadoInicial();
    preencherExemploCliente();
    preencherExemploVeiculo(veiculoPorId(c.veiculo));
    for (var i = 0; i < DADOS.planos.length; i++) if (DADOS.planos[i].nome === c.plano) estado.plano = DADOS.planos[i].id;
    estado.maxEtapa = 2;
    $all('.pergunta').forEach(function (li) { li.removeAttribute('data-estado'); });
    mostrarFluxo('cotacao');
    RUMO.announce('Cotação retomada. Os preços foram recalculados para hoje.');
  }

  /* ------------------------------------------------------------ Exemplo */
  function preencherExemploCliente() {
    var x = DADOS.exemplo;
    estado.r.contato = copia(x.contato);
    estado.r.estadoCivil = x.estadoCivil;
    estado.r.nascimento = x.nascimento;
    estado.r.sexo = x.sexo;
    estado.r.cpf = x.cpf;
    estado.r.jovens = x.jovens;
    estado.r.cienteJovens = true;
    estado.r.principal = x.principal;
    PERGUNTAS.cliente.forEach(function (p) { if (visivel(p)) estado.feitas[p] = true; });
    estado.atual.cliente = '';
  }

  function preencherExemploVeiculo(veiculo) {
    var x = DADOS.exemplo;
    if (veiculo) {
      estado.r.placa = { sabe: 'nao', marca: veiculo.marca, modelo: veiculo.modelo, anoFab: String(veiculo.ano), anoModelo: String(veiculo.ano) };
      estado.candidatos = buscarCandidatos(estado.r.placa);
      estado.r.veiculo = estado.candidatos.filter(function (c) { return c.id.indexOf(veiculo.id) === 0; })[0] || estado.candidatos[0];
    } else {
      estado.r.placa = { sabe: 'sim', placa: x.placa };
      estado.candidatos = buscarCandidatos(estado.r.placa);
      estado.r.veiculo = estado.candidatos[0];
    }
    estado.r.uso = x.uso;
    var achado = DADOS.ceps[digitos(x.cep)];
    estado.r.endereco = { cep: x.cep, rua: achado.rua, numero: x.numero, complemento: x.complemento, bairro: achado.bairro, cidade: achado.cidade, uf: achado.uf };
    estado.r.pernoite = x.pernoite;
    estado.r.detalhes = { financiado: x.financiado, blindado: x.blindado, gas: x.gas };
    estado.r.inicio = formatarData(hoje());
    PERGUNTAS.veiculo.forEach(function (p) { estado.feitas[p] = true; });
    estado.atual.veiculo = '';
  }

  function preencherExemplo() {
    var etapa = estado.etapa;
    if (etapa === 'cliente') preencherExemploCliente();
    else if (etapa === 'veiculo') preencherExemploVeiculo(null);
    else if (etapa === 'cotacao') { escolherPlano('ouro'); return; }
    else if (etapa === 'confirmacao') {
      marcarRadio($('#form-cobranca'), 'mesmoEndereco', 'sim');
      $('#bloco-cobranca').hidden = true;
      lerCobranca();
    } else if (etapa === 'pagamento') {
      $('#cartao-numero').value = '4111 1111 1111 1111';
      $('#cartao-nome').value = 'MARINA D LOPES';
      $('#cartao-validade').value = '08/29';
      $('#cartao-cvv').value = '123';
      $('#aceite').checked = true;
      atualizarCartaoVisual();
    }
    if (PERGUNTAS[etapa]) { renderFio(etapa); atualizarEstrada(); }
    atualizarContador();
    salvar();
    RUMO.announce('Etapa preenchida com dados de exemplo. Confira e siga para a próxima.');
    $('#btn-proxima').focus();
  }

  /* ------------------------------------------------------------ Início */
  document.addEventListener('DOMContentLoaded', function () {
    ligarCampos();
    ligarPerguntas();
    ligarAvisoJovens();
    ligarPersonalizar();
    ligarConfirmacao();
    ligarLogin();
    ligarPagamento();

    $('#nova-cotacao').addEventListener('click', novaCotacao);
    $('#btn-proxima').addEventListener('click', avancar);
    $('#btn-anterior').addEventListener('click', voltar);
    $('#preencher-exemplo').addEventListener('click', preencherExemplo);
    $('#sair-fluxo').addEventListener('click', function () { mostrarEntrada(false); });
    $('#paradas').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ir]');
      if (b && !b.disabled) irPara(b.getAttribute('data-ir'), { focarPergunta: false });
    });
    $('#baixar-comprovante').addEventListener('click', baixarComprovante);
    $('#ir-apolices').addEventListener('click', function () {
      $('#dlg-sucesso').close();
      estado = estadoInicial();
      mostrarEntrada(true);
    });
    $('#dlg-sucesso').addEventListener('cancel', function (e) { e.preventDefault(); });

    var iniciais = DADOS.cliente.iniciais;
    $('#avatar-entrada').textContent = iniciais;
    $('#avatar-fluxo').textContent = iniciais;

    // Recarregar a página no meio do fluxo volta para a mesma etapa.
    var s = RUMO.store.get('rascunho', null);
    if (s && s.tela === 'fluxo') {
      carregarRascunho();
      mostrarFluxo();
    } else {
      renderEntrada();
    }
  });
})();
