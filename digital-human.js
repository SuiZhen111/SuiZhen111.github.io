/* ============================================================
   数字分身问答（纯前端规则型知识库，无需任何后端）
   ============================================================ */
(function () {
  'use strict';

  var msgs = document.getElementById('dhMsgs');
  var form = document.getElementById('dhForm');
  var input = document.getElementById('dhInput');
  var chips = document.getElementById('dhChips');
  if (!msgs || !form || !input) return;

  /* 知识库：关键词 → 回答（命中的关键词越长，优先级越高） */
  var KB = [
    {
      k: ['你是谁', '名字', '叫什么', '介绍一下你', '介绍一下自己'],
      a: '我是<b>邰穗江</b>的数字分身！本尊是广西职业师范学院 计算机与信息工程学院 物联网专业的大二学生，今年 19 岁，来自贵州台江。'
    },
    {
      k: ['奖', '竞赛', '比赛', '荣誉', '获奖', '冠军', '奖项'],
      a: '拿过 <b>中国机器人及人工智能大赛国家级三等奖</b>，还有大创自治区级立项 2 项、"挑战杯"广西赛区三等奖、中国大学生计算机设计大赛广西赛区三等奖、广西大学生计算机设计大赛二等奖等，共 <b>12 项</b>竞赛与荣誉。详细列表在下方"竞赛荣誉"板块，点条目还能看证书原图～'
    },
    {
      k: ['项目', '大创', '作品', '做过什么', '开发'],
      a: '参与过<b>《桂韵智旅》</b>（广西非遗智慧文旅平台，大创+挑战杯+计设大赛三线开花）、<b>《云起岭南·潮启狮歌》</b>（计设大赛二等奖）和<b>机器人创新赛</b>项目。完整项目作品集正在建设中，敬请期待！'
    },
    {
      k: ['专业', '学什么', '课程', '物联网', '基础'],
      a: '<b>物联网专业</b>，正在打 C 语言和单片机的基础，下一步想深入 STM32 和 PCB 设计。'
    },
    {
      k: ['嵌入式', '方向', '软件还是硬件', '规划', '未来', '发展'],
      a: '本尊的方向是<b>嵌入式开发</b>——软件和硬件都很有兴趣，目前在两条路上都动手试试，用项目找答案。如果你有建议，欢迎通过邮箱告诉我！'
    },
    {
      k: ['联系', '邮箱', '微信', 'qq', '电话', '沟通', '合作'],
      a: '邮箱：<b>2759342832@qq.com</b>，GitHub：<b>SuiZhen111</b>。页面底部"联系我"也可以直达。'
    },
    {
      k: ['爱好', '跑步', '运动', '喜欢', '兴趣', '800', '1500'],
      a: '跑步！本尊是校跑步爱好者协会<b>训练部部长</b>，校运会 800 米一等奖、1500 米二等奖。相信技术和成长一样，靠的是日复一日的积累～'
    },
    {
      k: ['职务', '部长', '协会', '学生工作', '干部', '纪律'],
      a: '校跑步爱好者协会<b>训练部部长</b>、物联网电子技术协会<b>技术部部长助理</b>，还是班级纪律委员。'
    },
    {
      k: ['学校', '哪个学校', '在哪', '读书', '学院'],
      a: '<b>广西职业师范学院</b>，计算机与信息工程学院，物联网专业大二在读，坐标广西南宁。'
    },
    {
      k: ['哪里', '家乡', '贵州', '台江', '来自', '老家'],
      a: '来自<b>贵州省黔东南州台江县</b>，从贵州跑到广西读书～'
    },
    {
      k: ['几岁', '年龄', '多大', '19', '年级', '大几'],
      a: '19 岁，大二在读。'
    },
    {
      k: ['网站', '这个网站', '怎么做的', '谁做的', '网页'],
      a: '这个网站是本尊亲手用 <b>HTML / CSS / JS</b> 写的——流动的背景和头像光环都是 WebGL 着色器，3D 分身由 model-viewer 驱动，部署在 GitHub Pages 上。一个静态站也能玩出花～'
    },
    {
      k: ['你好', 'hello', 'hi', '在吗', '嗨'],
      a: '你好呀，很高兴见到你 👋 想了解本尊的什么？可以问我<b>奖项、项目、专业、爱好、联系方式</b>。'
    },
    {
      k: ['谢谢', '感谢', 'thanks', 'thank'],
      a: '不客气！欢迎常来逛逛，也欢迎约一场夜跑 🏃'
    },
    {
      k: ['拜拜', '再见', 'bye'],
      a: '再见！记得常来看看，本尊会一直在这里转圈圈等你 🤖'
    }
  ];

  var FALLBACK = [
    '这个问题有点超出我的知识库了 😅 你可以问我：<b>奖项、项目、专业、爱好、联系方式</b>，或者点下面的快捷问题。',
    '嗯…这个我还不会答，我的知识库还在学习成长中。换个问题试试？比如问我<b>拿过什么奖</b>！'
  ];

  function answer(text) {
    var q = text.toLowerCase();
    var best = null;
    var bestScore = 0;
    KB.forEach(function (item) {
      var score = 0;
      item.k.forEach(function (key) {
        if (q.indexOf(key.toLowerCase()) !== -1) score += key.length;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    if (best) return best.a;
    return FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
  }

  function addMsg(html, who) {
    var div = document.createElement('div');
    div.className = 'dh-msg ' + (who === 'user' ? 'dh-msg-user' : 'dh-msg-bot');
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function ask(text) {
    text = (text || '').trim();
    if (!text) return;
    addMsg(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'), 'user');
    var typing = addMsg(
      '<span class="dh-typing"><span></span><span></span><span></span></span>', 'bot'
    );
    setTimeout(function () {
      typing.remove();
      addMsg(answer(text), 'bot');
    }, 650 + Math.random() * 500);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
    input.value = '';
  });

  if (chips) {
    chips.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (btn) ask(btn.getAttribute('data-q'));
    });
  }
})();
