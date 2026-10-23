/*
 * Rumo Auto: dados de exemplo.
 * Pessoas, placas, CEPs, valores de tabela e preços são fictícios, criados para o case.
 * Marcas e modelos de carro são reais só para a cotação parecer plausível.
 */
(function () {
  'use strict';

  // Catálogo enxuto. "fipe" é o valor de referência fictício usado no cálculo.
  var veiculos = [
    { id: 'onix-22', marca: 'Chevrolet', modelo: 'Onix', versao: 'Onix Plus 1.0 Turbo LT, 4 portas', ano: 2022, fipe: 78450 },
    { id: 'onix-21', marca: 'Chevrolet', modelo: 'Onix', versao: 'Onix 1.0 LT, 4 portas', ano: 2021, fipe: 66900 },
    { id: 'tracker-23', marca: 'Chevrolet', modelo: 'Tracker', versao: 'Tracker 1.2 Turbo Premier, automático', ano: 2023, fipe: 131200 },
    { id: 'hb20-20', marca: 'Hyundai', modelo: 'HB20', versao: 'HB20 1.0 Comfort Plus, 4 portas', ano: 2020, fipe: 61300 },
    { id: 'creta-22', marca: 'Hyundai', modelo: 'Creta', versao: 'Creta 1.0 Turbo Comfort, automático', ano: 2022, fipe: 104800 },
    { id: 'kwid-21', marca: 'Renault', modelo: 'Kwid', versao: 'Kwid 1.0 Zen, 4 portas', ano: 2021, fipe: 49700 },
    { id: 'sandero-20', marca: 'Renault', modelo: 'Sandero', versao: 'Sandero 1.6 Stepway, manual', ano: 2020, fipe: 62400 },
    { id: 'kicks-22', marca: 'Nissan', modelo: 'Kicks', versao: 'Kicks 1.6 Sense, automático', ano: 2022, fipe: 98300 },
    { id: 'versa-21', marca: 'Nissan', modelo: 'Versa', versao: 'Versa 1.6 Advance, automático', ano: 2021, fipe: 87600 },
    { id: 'polo-23', marca: 'Volkswagen', modelo: 'Polo', versao: 'Polo 1.0 TSI Highline, automático', ano: 2023, fipe: 108900 },
    { id: 'tcross-22', marca: 'Volkswagen', modelo: 'T-Cross', versao: 'T-Cross 1.0 TSI Comfortline, automático', ano: 2022, fipe: 119500 },
    { id: 'argo-21', marca: 'Fiat', modelo: 'Argo', versao: 'Argo 1.3 Drive, manual', ano: 2021, fipe: 64800 },
    { id: 'pulse-23', marca: 'Fiat', modelo: 'Pulse', versao: 'Pulse 1.0 Turbo Audace, automático', ano: 2023, fipe: 112300 }
  ];

  // Placas que "a consulta" reconhece de cara. Qualquer outra placa válida
  // cai num veículo escolhido de forma determinística a partir das letras.
  var placas = {
    'RUM0A23': ['onix-22', 'onix-21'],
    'BRA2E19': ['hb20-20'],
    'QTZ4F56': ['kicks-22', 'versa-21']
  };

  var ceps = {
    '20040002': { rua: 'Rua da Assembleia', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' },
    '22041011': { rua: 'Rua Barata Ribeiro', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ' },
    '01310100': { rua: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' },
    '30130010': { rua: 'Avenida Afonso Pena', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG' },
    '80020000': { rua: 'Rua XV de Novembro', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' },
    '40020000': { rua: 'Rua Chile', bairro: 'Centro', cidade: 'Salvador', uf: 'BA' }
  };

  var ufs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
    'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  /*
   * Coberturas. Cada plano aponta para um nível de cada cobertura.
   * "fator" é a fatia do preço anual, em % do valor do carro, que aquele nível soma.
   * Os textos de "Não inclui" evitam traços vazios na tabela.
   */
  var coberturas = [
    {
      id: 'roubo', nome: 'Roubo, furto e incêndio', fixa: true,
      descricao: 'Paga 100% do valor de referência do carro se ele for roubado, furtado e não encontrado, ou se pegar fogo.',
      niveis: [{ rotulo: '100% da tabela', fator: 1.9 }]
    },
    {
      id: 'colisao', nome: 'Colisão',
      descricao: 'Cobre o conserto depois de uma batida. Na perda total, paga o valor de referência do carro.',
      niveis: [
        { rotulo: 'Não inclui', fator: 0 },
        { rotulo: 'Só perda total', fator: 0.9 },
        { rotulo: 'Total e parcial', fator: 1.8 }
      ]
    },
    {
      id: 'franquia', nome: 'Franquia', derivada: true,
      descricao: 'É a sua parte no conserto quando o dano é parcial. Quanto menor a franquia, maior a mensalidade.',
      niveis: [
        { rotulo: 'Não se aplica', fator: 0 },
        { rotulo: 'Normal', fator: 0 },
        { rotulo: 'Reduzida, metade', fator: 0.5 }
      ]
    },
    {
      id: 'terceiros', nome: 'Danos a terceiros',
      descricao: 'Paga os prejuízos que você causar ao carro, à casa ou à saúde de outra pessoa. O valor vale para danos materiais e corporais, cada um.',
      niveis: [
        { rotulo: 'R$ 50 mil', fator: 0.35 },
        { rotulo: 'R$ 100 mil', fator: 0.5 },
        { rotulo: 'R$ 200 mil', fator: 0.7 },
        { rotulo: 'R$ 300 mil', fator: 0.85 }
      ]
    },
    {
      id: 'morais', nome: 'Danos morais',
      descricao: 'Cobre indenizações por dano moral a terceiros decididas na Justiça depois de um acidente.',
      niveis: [
        { rotulo: 'Não inclui', fator: 0 },
        { rotulo: 'R$ 10 mil', fator: 0.08 },
        { rotulo: 'R$ 30 mil', fator: 0.16 }
      ]
    },
    {
      id: 'app', nome: 'Acidentes com passageiros',
      descricao: 'Indeniza quem estiver no carro, inclusive quem dirige, em caso de morte ou invalidez causada por acidente.',
      niveis: [
        { rotulo: 'Não inclui', fator: 0 },
        { rotulo: 'R$ 10 mil por pessoa', fator: 0.1 },
        { rotulo: 'R$ 30 mil por pessoa', fator: 0.2 }
      ]
    },
    {
      id: 'assistencia', nome: 'Assistência 24 horas',
      descricao: 'Guincho, chaveiro, troca de pneu e pane seca, a qualquer hora. O limite é a distância do reboque.',
      niveis: [
        { rotulo: 'Guincho até 100 km', fator: 0.12 },
        { rotulo: 'Guincho até 300 km', fator: 0.2 },
        { rotulo: 'Guincho sem limite de km', fator: 0.3 }
      ]
    },
    {
      id: 'reserva', nome: 'Carro reserva',
      descricao: 'Um carro emprestado enquanto o seu está na oficina ou depois de um roubo.',
      niveis: [
        { rotulo: 'Não inclui', fator: 0 },
        { rotulo: '7 dias', fator: 0.18 },
        { rotulo: '15 dias', fator: 0.3 },
        { rotulo: '30 dias', fator: 0.45 }
      ]
    },
    {
      id: 'vidros', nome: 'Vidros, faróis e retrovisores',
      descricao: 'Troca ou conserto de para-brisa, vidros laterais, faróis, lanternas e retrovisores, sem usar a franquia do carro.',
      niveis: [
        { rotulo: 'Não inclui', fator: 0 },
        { rotulo: 'Inclui', fator: 0.22 }
      ]
    }
  ];

  // Índice do nível de cada cobertura em cada plano.
  var planos = [
    {
      id: 'basico', nome: 'Básico', frase: 'Para quem quer o essencial contra roubo.',
      niveis: { roubo: 0, colisao: 0, franquia: 0, terceiros: 0, morais: 0, app: 0, assistencia: 0, reserva: 0, vidros: 0 }
    },
    {
      id: 'prata', nome: 'Prata', frase: 'Roubo e batidas grandes, com terceiros.',
      niveis: { roubo: 0, colisao: 1, franquia: 1, terceiros: 1, morais: 0, app: 0, assistencia: 1, reserva: 1, vidros: 0 }
    },
    {
      id: 'ouro', nome: 'Ouro', frase: 'O mais escolhido: cobre quase tudo.', destaque: true,
      niveis: { roubo: 0, colisao: 2, franquia: 1, terceiros: 2, morais: 1, app: 1, assistencia: 1, reserva: 2, vidros: 1 }
    },
    {
      id: 'diamante', nome: 'Diamante', frase: 'Cobertura máxima e franquia pela metade.',
      niveis: { roubo: 0, colisao: 2, franquia: 2, terceiros: 3, morais: 2, app: 2, assistencia: 2, reserva: 3, vidros: 1 }
    }
  ];

  // Ajustes de risco, em multiplicador sobre o preço. Valores ilustrativos.
  var ajustes = {
    uso: { lazer: 1, trabalho: 1.1, aplicativo: 1.28 },
    pernoite: { garagem: 0.92, estacionamento: 0.97, rua: 1.12 },
    jovens: 1.18,
    blindado: 1.1,
    gas: 1.05,
    financiado: 1
  };

  // Telas de entrada: cotações e apólices que a pessoa já tem.
  var cliente = {
    nome: 'Marina Duarte Lopes',
    primeiroNome: 'Marina',
    iniciais: 'MD',
    email: 'marina.lopes@exemplo.com.br',
    telefone: '(21) 98123-4567'
  };

  var cotacoesSalvas = [
    { veiculo: 'onix-22', data: '14/10/2026', plano: 'Ouro', mensal: 268.4 },
    { veiculo: 'hb20-20', data: '02/09/2026', plano: 'Prata', mensal: 171.9 }
  ];

  var apolicesSalvas = [
    { numero: '0420.26.00318', veiculo: 'kwid-21', placa: 'KWD1C21', plano: 'Prata', inicio: '03/03/2026', fim: '03/03/2027', mensal: 139.6 }
  ];

  // Dados usados pelo botão "Preencher com exemplo".
  var exemplo = {
    contato: { nome: 'Marina Duarte Lopes', telefone: '(21) 98123-4567', email: 'marina.lopes@exemplo.com.br' },
    estadoCivil: 'casada',
    nascimento: '12/04/1991',
    sexo: 'feminino',
    cpf: '529.982.247-25',
    jovens: 'nao',
    principal: 'sim',
    placa: 'RUM0A23',
    uso: 'lazer',
    cep: '22041-011',
    numero: '512',
    complemento: 'apto 801',
    pernoite: 'garagem',
    financiado: 'nao', blindado: 'nao', gas: 'nao'
  };

  window.RUMO_DADOS = {
    veiculos: veiculos,
    placas: placas,
    ceps: ceps,
    ufs: ufs,
    coberturas: coberturas,
    planos: planos,
    ajustes: ajustes,
    cliente: cliente,
    cotacoesSalvas: cotacoesSalvas,
    apolicesSalvas: apolicesSalvas,
    exemplo: exemplo,
    mesTabela: 'outubro de 2026'
  };
})();
