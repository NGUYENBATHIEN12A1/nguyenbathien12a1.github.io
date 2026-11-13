/* Mã dùng chung cho mọi trang. Phần nào không có trên trang hiện tại thì tự bỏ qua. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Lưu trữ an toàn (không lỗi nếu trình duyệt chặn) ---------- */
  var storage = {
    get: function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { localStorage.setItem(key, value); } catch (e) { /* bỏ qua */ } }
  };

  /* ---------- Chế độ sáng / tối ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    return root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
  }
  function syncThemeButton() {
    var isDark = currentTheme() === 'dark';
    var label = isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
    themeBtn.dataset.mode = isDark ? 'dark' : 'light';
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  }
  themeBtn.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    storage.set('theme', next);
    syncThemeButton();
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', syncThemeButton);
  syncThemeButton();

  var hasIO = 'IntersectionObserver' in window;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;   // máy có chuột

  /* ---------- Thanh điều hướng: đổ bóng, thanh tiến trình, nút lên đầu trang ---------- */
  var header = document.querySelector('.site-header');
  var progressBar = header.querySelector('.scroll-progress');
  var toTop = document.getElementById('to-top');
  var scrollRaf = 0;
  function onScroll() {
    scrollRaf = 0;
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    header.classList.toggle('is-scrolled', y > 8);
    if (progressBar) progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
    if (toTop) toTop.classList.toggle('is-shown', y > 600);
  }
  window.addEventListener('scroll', function () {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  /* ---------- Điện thoại: cuộn dải menu để mục của trang đang mở nằm giữa ---------- */
  var navMenu = document.getElementById('nav-menu');
  var currentLink = navMenu && navMenu.querySelector('[aria-current="page"]');
  function centerCurrentLink() {
    if (currentLink && navMenu.scrollWidth > navMenu.clientWidth) {
      navMenu.scrollLeft = currentLink.offsetLeft - (navMenu.clientWidth - currentLink.offsetWidth) / 2;
    }
  }
  centerCurrentLink();
  // Font tải xong thì chữ rộng hơn → căn lại; đổi cỡ cửa sổ cũng căn lại
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(centerCurrentLink);
  window.addEventListener('resize', centerCurrentLink);

  /* ---------- Hero: các dòng chữ hiện lần lượt ---------- */
  var heroSection = document.querySelector('.hero');
  if (heroSection && !reduceMotion) heroSection.classList.add('is-entered');

  /* ---------- Timeline học vấn: đường dọc tự vẽ khi cuộn tới ---------- */
  var timelines = Array.prototype.slice.call(document.querySelectorAll('.timeline'));
  if (!hasIO || reduceMotion) {
    timelines.forEach(function (t) { t.classList.add('is-drawn'); });
  } else {
    var drawer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-drawn');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.05 });
    timelines.forEach(function (t) { drawer.observe(t); });
  }

  /* ---------- Học vấn khóa bằng mã PIN ----------
     Nội dung được mã hóa AES-256-GCM (khóa sinh từ PIN bằng PBKDF2), mã nguồn trang không chứa nội dung lẫn mã PIN.
     SỬA nội dung / đổi PIN: sửa hoc-van.private.html rồi chạy  node tools/khoa-hoc-van.mjs <PIN-mới>  */
  (function () {
    var root = document.getElementById('edu-lock-root');
    var dataEl = document.getElementById('edu-locked-data');
    if (!root || !dataEl) return;
    var card = document.getElementById('edu-lock');
    var form = document.getElementById('edu-lock-form');
    var input = document.getElementById('edu-pin');
    var msg = document.getElementById('edu-lock-msg');
    var btn = form.querySelector('button');
    var payload = JSON.parse(dataEl.textContent);
    var unlocked = null;

    function fromB64(s) {
      var bin = atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    function decrypt(pin) {
      var subtle = window.crypto && window.crypto.subtle;
      if (!subtle) return Promise.reject(new Error('no-crypto'));
      var enc = new TextEncoder();
      return subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
        .then(function (base) {
          return subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(payload.salt), iterations: payload.iter, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        })
        .then(function (key) { return subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.data)); })
        .then(function (buf) { return new TextDecoder().decode(buf); });
    }
    function say(text, isError) {
      msg.textContent = text;
      msg.classList.toggle('is-error', !!isError);
    }
    function show(html) {
      unlocked = document.createElement('div');
      unlocked.className = 'edu-unlocked';
      unlocked.tabIndex = -1;
      unlocked.innerHTML =
        '<div class="edu-unlocked-bar">' +
          '<span class="edu-unlocked-badge"><svg class="icon" aria-hidden="true"><use href="#i-unlock"/></svg>Đã mở khóa</span>' +
          '<button type="button" class="edu-relock"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>Khóa lại</button>' +
        '</div>' + html;
      card.hidden = true;
      root.appendChild(unlocked);
      // Hiệu ứng hiện dần + timeline tự vẽ cho phần vừa mở
      var items = unlocked.querySelectorAll('.reveal');
      Array.prototype.forEach.call(items, function (el, i) {
        if (reduceMotion) el.classList.add('is-visible');
        else setTimeout(function () { el.classList.add('is-visible'); }, 90 * i);
      });
      var tl = unlocked.querySelector('.timeline');
      if (tl) setTimeout(function () { tl.classList.add('is-drawn'); }, reduceMotion ? 0 : 60);
      unlocked.querySelector('.edu-relock').addEventListener('click', lock);
      unlocked.focus({ preventScroll: true });
    }
    function lock() {
      if (unlocked) { unlocked.remove(); unlocked = null; }
      card.hidden = false;
      input.value = '';
      say('Đã khóa lại.', false);
      input.focus({ preventScroll: true });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = input.value.trim();
      if (!/^\d{4,12}$/.test(pin)) { say('Mã PIN chỉ gồm chữ số.', true); input.focus(); return; }
      btn.disabled = true;
      say('Đang mở khóa…', false);
      decrypt(pin).then(function (html) {
        say('', false);
        show(html);
      }).catch(function (err) {
        if (err && err.message === 'no-crypto') { say('Trình duyệt không hỗ trợ giải mã. Hãy mở trang qua https.', true); return; }
        say('Sai mã PIN, thử lại nhé.', true);
        card.classList.remove('is-shake'); void card.offsetWidth; card.classList.add('is-shake');
        input.select();
      }).then(function () {
        setTimeout(function () { btn.disabled = false; }, 600);   // chậm lại một chút giữa các lần thử
      });
    });
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '');               // chỉ cho nhập số
      if (msg.classList.contains('is-error')) say('', false);
    });
  })();

  /* =========================================================
     DỰ ÁN: dữ liệu + vẽ thẻ + bộ lọc + phân trang thu gọn
     ========================================================= */

  var PROJECT_FILTERS = [
    { id: 'all',         label: 'Tất cả',          tone: 'tone-slate' },
    { id: 'fpga',        label: 'FPGA/AI',         tone: 'tone-rose' },
    { id: 'cpu',         label: 'IC & Vi xử lý',   tone: 'tone-blue' },
    { id: 'embedded',    label: 'Nhúng',           tone: 'tone-teal' },
    { id: 'electronics', label: 'Điện tử',         tone: 'tone-amber' },
    { id: 'software',    label: 'Phần mềm & Mạng', tone: 'tone-violet' }
  ];
  function filterById(id) {
    for (var i = 0; i < PROJECT_FILTERS.length; i++) if (PROJECT_FILTERS[i].id === id) return PROJECT_FILTERS[i];
    return null;
  }

  // Số dự án hiển thị mặc định (1 card nổi bật + 1 card rộng + 3 card trên 1 hàng = 5)
  var PROJECT_LIMIT = 5;

  var projects = [
    {
      id: 'doorbell',
      date: '2024', time: '2024',
      kind: 'Đồ án cơ sở 1',
      category: ['electronics'],
      title: 'Mạch báo chuông cửa dùng LDR',
      desc: 'Mạch cảm biến ánh sáng dùng LDR và IC LM358 để phát hiện khi cửa được mở (ánh sáng thay đổi), kích LED và còi buzzer báo chuông.',
      tags: ['LDR', 'LM358', 'LED', 'Buzzer', 'Điện trở'],
      flow: { caption: '// cảm biến → so sánh → cảnh báo → còi', cols: [['LDR'], ['LM358'], ['LED'], ['Buzzer']], main: 1 },
      overview: 'Đồ án cơ sở 1 tại VKU, năm 2024: mạch báo chuông cửa dựa trên sự thay đổi ánh sáng khi cửa được mở.',
      goal: 'Thiết kế mạch báo chuông cửa dùng cảm biến ánh sáng LDR và IC LM358: khi cửa được mở làm ánh sáng thay đổi, mạch bật LED và còi buzzer để báo.',
      blocks: [
        'Cảm biến LDR: cùng điện trở tạo cầu phân áp, điện áp ra thay đổi theo cường độ ánh sáng.',
        'So sánh LM358: so điện áp từ cầu phân áp LDR với mức ngưỡng đặt sẵn.',
        'Cảnh báo LED: sáng khi ngõ ra LM358 đổi trạng thái.',
        'Còi buzzer: kêu cùng lúc với LED để báo chuông.'
      ],
      content: [
        'LDR cùng điện trở tạo cầu phân áp, đưa điện áp thay đổi theo ánh sáng vào một ngõ vào của LM358.',
        'Ngõ vào còn lại của LM358 được đặt mức ngưỡng bằng một cầu phân áp cố định.',
        'LM358 làm bộ so sánh: khi ánh sáng thay đổi vượt ngưỡng (cửa được mở), ngõ ra LM358 đổi trạng thái.',
        'Ngõ ra LM358 kích LED sáng và còi buzzer kêu để báo chuông.'
      ],
      tech: ['Quang trở LDR', 'IC LM358 (dùng làm bộ so sánh)', 'LED', 'Còi buzzer', 'Điện trở (cầu phân áp)'],
      // SỬA: điền kết quả, hạn chế, hướng phát triển thực tế (để null thì trang chi tiết hiện "Đang cập nhật")
      results: null, limits: null, future: null,
      images: []
    },
    {
      id: 'tilelink',
      date: '2026-05', time: '05/2026',
      kind: 'Đồ án thiết kế 1',
      members: 'Trần Quốc Sĩ, Nguyễn Bá Thiện, Nguyễn Tam Nguyên (23IC)',
      category: ['cpu'],
      badge: 'Mới nhất',
      wide: true,
      title: 'Cầu nối TileLink Bus ↔ UART trong SoC RISC-V',
      titleEn: 'Design and Implementation of a TileLink Bus to UART Bridge in RISC-V Processors',
      desc: 'Thiết kế SoC gồm lõi RISC-V RV32I pipeline 5 tầng, bus TileLink-UL và ngoại vi UART qua MMIO; mô phỏng bằng ModelSim, tổng hợp và P&R bằng OpenLane (SKY130), kiểm chứng thêm trên FPGA Cyclone II.',
      tags: ['RISC-V', 'TileLink', 'UART', 'Verilog/SystemVerilog', 'OpenLane', 'SKY130', 'Quartus', 'ModelSim'],
      flow: { caption: '// SoC · TileLink-UL · MMIO', cols: [['RISC-V Core'], ['TileLink Bus'], ['SRAM', 'UART']], main: 1 },
      goal: 'Thiết kế và hiện thực cầu nối giữa bus TileLink và ngoại vi UART trong SoC dùng lõi RISC-V, từ RTL đến layout, kèm kiểm chứng trên FPGA.',
      content: [
        'SoC gồm lõi RISC-V RV32I pipeline 5 tầng, bus TileLink-UL và ngoại vi UART giao tiếp qua MMIO.',
        'tlul_demux giải mã địa chỉ, định tuyến và handshake tới 2 slave: SRAM và UART.',
        'Khối UART: tlul_uart ↔ tx_fifo / rx_fifo ↔ uart_tx / uart_rx, kèm uart_baud_gen và TX control.',
        'UART: clock hệ thống 50 MHz, 9600 baud, oversampling x16, bộ chia DIV = 326, khung 8N1.',
        'Giao dịch TileLink: Get, PutFullData, PutPartialData, AccessAck, AccessAckData.',
        'Mô phỏng: testbench gửi chuỗi ký tự "HELLO23..." qua TileLink ghi vào UART; quan sát waveform kênh A/D → UART MMIO → tx_o (serial).'
      ],
      tech: [
        'Verilog/SystemVerilog – thiết kế RTL',
        'ModelSim – mô phỏng, quan sát waveform',
        'OpenLane + SKY130 HD – tổng hợp (Yosys), P&R, signoff',
        'Quartus II 13.0.1 – FPGA Cyclone II EP2C35F672C6'
      ],
      memoryMap: [
        { type: 'mem', name: 'SRAM', range: '0x1000_0000 – 0x1000_07FF', size: '2 KB', note: '512 từ × 32-bit' },
        { type: 'reserved', name: 'Reserved', range: '0x1000_0800 – 0x1000_3FFF' },
        {
          type: 'io', name: 'UART MMIO', range: 'Base 0x1000_4000', size: '32 B',
          regs: [
            { off: '+0x00', name: 'TXDATA', access: 'W' },
            { off: '+0x08', name: 'RXDATA', access: 'R' },
            { off: '+0x10', name: 'STATUS', access: 'R', note: 'bit1 = rx_empty · bit3 = tx_full' },
            { off: '+0x18', name: 'DIV', access: 'R/W' }
          ]
        }
      ],
      metrics: [
        { label: 'Công nghệ', value: 'SKY130 HD', note: 'OpenLane' },
        { label: 'Clock', value: '50 MHz', note: 'Chu kỳ 20 ns' },
        { label: 'Cell sau tổng hợp', value: '6.371', note: 'Yosys' },
        { label: 'Diện tích tổng hợp', value: '86.252,7 µm²', note: '45,31% là phần tử tuần tự' },
        { label: 'Standard cell post-route', value: '8.226', note: 'Mật độ thiết kế ~59%' },
        { label: 'Worst setup slack', value: '3,3566 ns', note: '0 vi phạm setup', status: 'pass' },
        { label: 'Worst hold slack', value: '0,1064 ns', note: '0 vi phạm hold', status: 'pass' },
        { label: 'DRC', value: 'Passed', note: 'Signoff', status: 'pass' },
        { label: 'LVS', value: 'Matched', note: 'Circuits match uniquely', status: 'pass' },
        { label: 'Công suất', value: '8,84 mW', note: 'TT 25°C · 1,80 V' },
        { label: 'FPGA Cyclone II', value: '24.364 / 33.216 LE', note: '73% · EP2C35F672C6' },
        { label: 'Fmax FPGA', value: '51,99 MHz', note: 'Quartus II 13.0.1' }
      ],
      images: [],   // Đặt ảnh trong ./assets/projects/tilelink/ (vd: ['waveform.png', { file: 'gds.png', caption: 'Layout GDS' }])
      results: null, limits: null, future: null
    },
    {
      id: 'chat',
      date: '2025-12', time: '12/2025',
      kind: 'Đồ án lập trình mạng',
      course: 'Lập trình mạng (khoa Khoa học máy tính)',
      members: 'Nguyễn Bá Thiện, Lê Quốc Tùng (23IC)',
      category: ['software'],
      title: 'Ứng dụng chat thời gian thực – hướng Hybrid P2P',
      desc: 'Ứng dụng giao tiếp thời gian thực viết bằng Java, giao diện JavaFX, truyền dữ liệu qua TCP Socket; server đa luồng quản lý phiên và định tuyến gói tin. Hiện chạy theo mô hình Client–Server, hướng tới Hybrid P2P.',
      tags: ['Java', 'JavaFX', 'TCP Socket', 'Multi-thread', 'SQLite', 'Whiteboard'],
      flow: { type: 'star', caption: '// client–server qua TCP', clients: ['Client A', 'Client B', 'Client C'], server: 'Server', serverNote: 'TCP · đa luồng' },
      goal: 'Xây dựng ứng dụng giao tiếp thời gian thực theo mô hình Client–Server qua TCP, làm nền tảng để hướng tới kiến trúc Hybrid P2P.',
      content: [
        'Đăng ký / đăng nhập.',
        'Chat 1-1; tạo nhóm và chat nhóm.',
        'Gửi file.',
        'Bảng trắng (whiteboard) đồng bộ nét vẽ theo thời gian thực.',
        'Quản lý trạng thái online/offline.',
        'Kiến trúc 3 tầng: UI – Business – Communication; server dùng mô hình thread-per-client.',
        'Dữ liệu hiện được trao đổi qua server trung gian, chưa kết nối P2P trực tiếp giữa các client.'
      ],
      tech: [
        'Java',
        'JavaFX – giao diện người dùng',
        'TCP Socket – truyền dữ liệu',
        'Server đa luồng (thread-per-client)',
        'SQLite – lưu trữ dữ liệu'
      ],
      results: null,
      limits: [
        'Chưa mã hóa kết nối bằng SSL/TLS.',
        'Mô hình thread-per-client khó mở rộng lên hàng trăm/nghìn client.',
        'Chưa có gọi thoại/video.'
      ],
      future: [
        'Bổ sung gọi thoại/video (dự kiến dùng UDP).',
        'Hướng tới P2P thật sự để giảm tải cho server.'
      ],
      images: []
    },
    {
      id: 'riscv',
      date: '2025-06', time: '06/2025',
      kind: 'Môn học thiết kế IC số',
      course: 'Thiết kế IC số',
      members: 'Nguyễn Bá Thiện, Trần Quốc Sĩ (23IC)',
      category: ['cpu'],
      title: 'Thiết kế & mô phỏng CPU RISC-V RV32I pipeline 5 tầng bằng Verilog RTL',
      desc: 'CPU RV32I với pipeline 5 tầng IF-ID-EX-MEM-WB viết bằng Verilog RTL, có Forwarding Unit xử lý data hazard và cơ chế xử lý control hazard. Mô phỏng trên ModelSim, chạy luồng OpenLane đến layout GDS.',
      tags: ['RISC-V', 'Verilog', 'ModelSim', 'OpenLane', 'Pipeline'],
      flow: { caption: '// RV32I · pipeline 5 tầng', cols: [['IF'], ['ID'], ['EX'], ['MEM'], ['WB']] },
      goal: 'Thiết kế CPU RISC-V tập lệnh RV32I theo kiến trúc pipeline 5 tầng ở mức RTL, mô phỏng kiểm tra hoạt động và thực hiện luồng thiết kế vật lý.',
      content: [
        'Pipeline 5 tầng: IF – ID – EX – MEM – WB.',
        'Các khối chức năng: ALU, Register File, Control Unit, Immediate Generator.',
        'Forwarding Unit xử lý data hazard; xử lý control hazard.'
      ],
      tech: [
        'Verilog – mô tả phần cứng mức RTL',
        'Venus – dịch chương trình assembly sang mã hex',
        'ModelSim – mô phỏng và xem waveform',
        'OpenLane – synthesis, layout GDS, phân tích timing'
      ],
      results: null, limits: null, future: null,
      images: []
    },
    {
      id: 'parking',
      date: '2025-05', time: '05/2025',
      kind: 'Đồ án cơ sở 3',
      members: 'Nguyễn Bá Thiện, Nguyễn Văn Đức',
      category: ['embedded'],
      title: 'Mạch bãi đỗ xe thông minh',
      desc: 'Arduino Uno R3 nhận diện thẻ RFID RC522 để điều khiển barie bằng servo SG90, cảm biến hồng ngoại kiểm tra chỗ trống, LCD 16x2 hiển thị và buzzer cảnh báo đỗ sai vị trí.',
      tags: ['Arduino', 'RFID RC522', 'IR Sensor', 'Servo SG90', 'LCD I2C'],
      flow: { caption: '// nhận diện thẻ → điều khiển barie', cols: [['RFID', 'IR'], ['Arduino'], ['Servo', 'LCD', 'Buzzer']], main: 1 },
      goal: 'Xây dựng mô hình bãi đỗ xe tự động nhận diện thẻ, điều khiển barie và kiểm tra tình trạng chỗ đỗ.',
      content: [
        'Nhận diện thẻ bằng module RFID RC522.',
        'Cảm biến hồng ngoại kiểm tra chỗ trống.',
        'Servo SG90 điều khiển đóng/mở barie.',
        'LCD 16x2 (giao tiếp I2C) hiển thị thông tin.',
        'Buzzer cảnh báo khi đỗ sai vị trí.'
      ],
      tech: ['Arduino Uno R3', 'Module RFID RC522', 'Cảm biến hồng ngoại (IR)', 'Servo SG90', 'LCD 16x2 (I2C)', 'Buzzer'],
      results: null, limits: null, future: null,
      images: []
    },
    {
      id: 'env',
      date: '2025-01', time: '01/2025',
      kind: 'Đồ án lập trình hệ thống nhúng',
      course: 'Lập trình hệ thống nhúng',
      members: 'Nguyễn Bá Thiện, Trần Dụng Đạt, Nguyễn Văn Đức',
      category: ['embedded'],
      title: 'Hệ thống thu thập dữ liệu môi trường',
      desc: 'ESP32 đọc nhiệt độ, độ ẩm, áp suất và cường độ ánh sáng (BH1750), lấy thời gian thực từ DS1307, hiển thị trên OLED và truyền dữ liệu không dây qua Bluetooth HC-05.',
      tags: ['ESP32', 'I2C', 'UART', 'OLED', 'BH1750', 'DS1307', 'HC-05'],
      flow: { caption: '// T·H·P = nhiệt độ · độ ẩm · áp suất', cols: [['T·H·P', 'BH1750', 'DS1307'], ['ESP32'], ['OLED', 'HC-05']], main: 1 },
      goal: 'Xây dựng hệ thống dùng ESP32 thu thập dữ liệu môi trường kèm thời gian thực, hiển thị tại chỗ và truyền dữ liệu không dây.',
      content: [
        'Đọc cảm biến nhiệt độ, độ ẩm, áp suất.',
        'Đo cường độ ánh sáng bằng cảm biến BH1750.',
        'Lấy thời gian thực từ module DS1307.',
        'Hiển thị dữ liệu trên màn hình OLED.',
        'Truyền dữ liệu không dây qua Bluetooth HC-05.'
      ],
      tech: [
        'Vi điều khiển ESP32',
        'Cảm biến nhiệt độ / độ ẩm / áp suất',
        'Cảm biến ánh sáng BH1750',
        'Module thời gian thực DS1307',
        'Màn hình OLED',
        'Module Bluetooth HC-05',
        'Giao tiếp I2C và UART'
      ],
      results: null, limits: null, future: null,
      images: []
    },
    {
      id: 'water',
      date: '2024-12', time: '12/2024',
      kind: 'Đồ án cơ sở 2',
      category: ['electronics'],
      title: 'Mạch cảm biến mức nước',
      desc: 'Mạch điện tử số/analog cơ bản phát hiện mức nước theo nguyên lý nước dẫn điện, dùng transistor BC547 làm công tắc và các IC logic để hiển thị mức nước trên LED 7 đoạn và LED.',
      tags: ['BC547', 'Logic IC', 'LED 7 đoạn'],
      flow: { caption: '// nước dẫn điện → transistor làm công tắc', cols: [['Điện cực'], ['BC547'], ['IC logic'], ['LED 7 đoạn']], main: 1 },
      goal: 'Thiết kế mạch phát hiện và hiển thị mức nước bằng các linh kiện điện tử số và analog cơ bản.',
      content: [
        'Phát hiện mức nước dựa trên nguyên lý nước dẫn điện.',
        'Transistor BC547 đóng vai trò công tắc.',
        'Xử lý tín hiệu bằng các IC logic CD4070, 74HC32, CD4011, CD4081, CD4077.',
        'Hiển thị mức nước bằng LED 7 đoạn và LED.'
      ],
      tech: ['Transistor BC547', 'IC logic: CD4070, 74HC32, CD4011, CD4081, CD4077', 'LED 7 đoạn', 'LED'],
      results: null, limits: null, future: null,
      images: []
    },
    {
      id: 'robocar',
      date: '2025-06', time: '06/2025',
      kind: 'Đồ án vi điều khiển',
      course: 'Vi điều khiển',
      members: 'Nhóm 6 sinh viên lớp 23IC',
      category: ['embedded'],
      title: 'Robocar – xe điều khiển từ xa & xe tự hành',
      desc: 'Hai mô hình xe cho môn Vi điều khiển: xe điều khiển không dây có tay gắp servo để gắp và bắn bóng, và xe tự hành dò line, tránh vật cản, nhận biết và leo bậc thang.',
      tags: ['ESP32', 'Arduino UNO', 'L298N', 'Servo MG996R', 'TCRT5000', 'HC-SR04', 'LM2596', 'Proteus'],
      flow: {
        caption: '// điều khiển · cảm biến · chấp hành',
        rows: [
          { label: 'Xe điều khiển', cols: [['PS2', 'Web app'], ['ESP32'], ['L298N'], ['DC + Servo']], main: 1 },
          { label: 'Xe tự hành', cols: [['TCRT5000', 'HC-SR04'], ['Arduino UNO'], ['L298N'], ['6× DC']], main: 1 }
        ],
        note: 'Nguồn: pin 3×3.7V (11.1V) → LM2596 → 5V'
      },
      overview: 'Đồ án môn Vi điều khiển của nhóm 6 sinh viên lớp 23IC, hoàn thành 06/2025. Gồm hai mô hình: xe điều khiển không dây và xe tự hành.',
      goal: 'Xây dựng hai mô hình xe: xe điều khiển không dây có tay gắp servo để gắp và bắn bóng; xe tự hành dò line, tránh vật cản, nhận biết và leo bậc thang.',
      blocks: [
        'Xe điều khiển: ESP32 nhận lệnh không dây (tay cầm PS2 / ứng dụng web "Robocar 2025"), điều khiển 4 động cơ DC qua L298N và tay gắp dùng servo MG996R.',
        'Nguồn xe điều khiển: dòng tổng ~6,4 A; nguồn cần ≥ 3,5 A sau khi tính hiệu suất buck 90%.',
        'Xe tự hành: Arduino UNO đọc dãy cảm biến hồng ngoại (dò line) và HC-SR04 (né vật cản < ~20 cm), điều tốc bằng PWM, 6 động cơ DC.',
        'Xe tự hành chạy 3 chế độ: dò line, né vật cản, leo bậc (điều khiển xung xen kẽ). Dòng tổng ~1,9 A, L298N sụt áp ~2 V.',
        'Nguồn chung: pin 3×3.7V (11.1V) → LM2596 hạ áp 5V.'
      ],
      tech: [
        'ESP32, Arduino UNO',
        'Driver động cơ L298N',
        'Servo MG996R (tay gắp)',
        'Cảm biến hồng ngoại TCRT5000 (dò line)',
        'Cảm biến siêu âm HC-SR04',
        'Mạch hạ áp LM2596, pin 3×3.7V',
        'Tay cầm PS2 / ứng dụng web "Robocar 2025"',
        'Proteus'
      ],
      results: [
        'Cả hai xe chạy mượt, kết nối ổn định, không giật hay mất kết nối.',
        'Xe điều khiển gắp bóng, đi theo lộ trình và bắn bóng trúng mục tiêu.'
      ],
      limits: null,
      future: ['Tích hợp hệ thống thi đấu đa nhiệm.'],
      images: []
    },
    {
      id: 'traffic',
      date: '2025-05', time: '05/2025',
      kind: 'Đồ án điện tử ứng dụng',
      course: 'Điện tử ứng dụng',
      members: 'Nguyễn Bá Thiện, Lê Quốc Tùng (23IC)',
      category: ['electronics'],
      title: 'Mạch đèn giao thông đếm lùi',
      desc: 'Mạch mô phỏng đèn giao thông một chiều bằng IC số rời, không dùng vi điều khiển: tạo xung bằng IC 555, đếm và giải mã để hiển thị thời gian đếm lùi trên LED 7 đoạn, kèm 3 đèn Đỏ–Vàng–Xanh.',
      tags: ['IC 555', '74LS192', 'CD4511', 'LED 7 đoạn', 'C1815', '1N4007', 'Proteus', 'PCB tự làm'],
      flow: { caption: '// xung · đếm · giải mã · hiển thị', cols: [['IC 555'], ['74LS192'], ['4511'], ['LED 7 đoạn', 'Đỏ·Vàng·Xanh']], main: 1 },
      overview: 'Đồ án môn Điện tử ứng dụng, nhóm 2 sinh viên lớp 23IC, 05/2025. Quy trình: lý thuyết → mô phỏng Proteus → lắp breadboard → tự làm PCB (in giấy nhiệt, ép nhiệt, ăn mòn đồng, khoan lỗ).',
      goal: 'Mô phỏng đèn giao thông một chiều bằng IC số rời, không dùng vi điều khiển, hiển thị thời gian đếm lùi trên LED 7 đoạn kèm 3 đèn Đỏ–Vàng–Xanh.',
      blocks: [
        'Khối nguồn: lọc bằng tụ gốm 104 và tụ hóa 100 µF.',
        'Khối tạo xung: IC 555 chế độ astable, chỉnh tần số bằng biến trở 10 kΩ.',
        'Khối đếm / mã hóa hiển thị: 74LS192 + 4511 → LED 7 đoạn.',
        'Transistor C1815 điều khiển LED.'
      ],
      tech: ['IC 555', 'Bộ đếm 74LS192', 'IC giải mã CD4511', 'LED 7 đoạn, LED Đỏ–Vàng–Xanh', 'Transistor C1815', 'Diode 1N4007', 'Biến trở 10 kΩ, tụ gốm 104, tụ hóa 100 µF', 'Proteus, PCB tự làm'],
      results: null,
      limits: [
        'Chọn giá trị linh kiện chưa chính xác nên còn sai số thời gian đếm.',
        'PCB còn đơn giản, chưa tối ưu bố trí.'
      ],
      future: [
        'Dùng cảm biến để tự động hóa.',
        'Thêm LCD hoặc kết nối Arduino/STM32.',
        'Thiết kế lại PCB bằng Altium/Eagle.',
        'Tối ưu khối nguồn.'
      ],
      images: []
    },
    {
      id: 'clock',
      date: '2025-05', time: '05/2025',
      kind: 'Đồ án cơ sở 4',
      members: 'Nguyễn Bá Thiện (23IC)',
      category: ['electronics'],
      title: 'Đồng hồ số dùng IC số',
      desc: 'Mạch đồng hồ số dùng toàn bộ IC logic rời (không vi điều khiển): xung chuẩn 1Hz từ IC 555, chuỗi bộ đếm BCD 7490, giải mã 74247 và hiển thị LED 7 đoạn, có nút nhấn chỉnh số.',
      tags: ['IC 555', '74LS90', '74LS247', 'CD4081', 'LED 7 đoạn', 'TTL 5V', 'Proteus'],
      flow: { caption: '// xung 1Hz · đếm BCD · giải mã', cols: [['555 · 1Hz'], ['7490 · BCD'], ['74247'], ['LED 7 đoạn']], main: 1 },
      overview: 'Đồ án cơ sở 4, thực hiện cá nhân, lớp 23IC, 05/2025.',
      goal: 'Xây dựng mạch đồng hồ số chỉ dùng IC logic rời (không vi điều khiển), hiển thị trên LED 7 đoạn, có nút nhấn chỉnh số.',
      blocks: [
        'Chuỗi khối: tạo xung → chia tần → đếm → giải mã → hiển thị.',
        'Xung chuẩn 1 Hz từ IC 555; chuỗi bộ đếm BCD 7490; giải mã 74247 → LED 7 đoạn.',
        'Nguồn 5V, tụ lọc 104 và tụ hóa chống nhiễu; tính điện trở hạn dòng cho LED 7 đoạn.',
        'Nút nhấn để chỉnh số.'
      ],
      tech: ['IC 555', 'Bộ đếm 74LS90 (7490)', 'IC giải mã 74LS247', 'IC CD4081', 'LED 7 đoạn', 'Logic TTL 5V', 'Proteus'],
      results: [
        'Xung clock đều, LED sáng rõ, hiển thị đúng 0–9, không nhảy số sai.',
        'Thiết kế dạng module: có thể đổi tần số bằng R–C của 555 hoặc mở rộng thêm phút, giờ.'
      ],
      limits: [
        'Dùng nhiều IC nên mạch cồng kềnh, dây nối nhiều.',
        'Dòng tiêu thụ lớn (≥ ~500 mA).'
      ],
      future: [
        'Báo thức (74LS373 lưu giờ + 74LS85 so sánh).',
        'LED trạng thái.',
        'Cảnh báo pin yếu (comparator LM311/LM339).',
        'Tích hợp vi điều khiển.'
      ],
      images: []
    }
  ];

  /* --- Hàm tạo phần tử HTML & SVG an toàn --- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    return node;
  }
  function svgIcon(id, extraClass) {
    var svg = svgEl('svg', {
      class: 'icon' + (extraClass ? ' ' + extraClass : ''),
      'aria-hidden': 'true'
    });
    var use = svgEl('use', { href: '#' + id });
    svg.appendChild(use);
    return svg;
  }
  function renderTech(list) {
    var ul = el('ul', 'tech');
    ul.setAttribute('aria-label', 'Công nghệ sử dụng');
    list.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    return ul;
  }

  /* --- Sơ đồ SVG Client–Server 2 chiều (flow.type === 'star') --- */
  function renderStar(flow) {
    var clients = flow.clients || ['Client A', 'Client B', 'Client C'];
    var svg = svgEl('svg', {
      viewBox: '0 0 320 124',
      class: 'mini-star',
      'aria-hidden': 'true'
    });

    var serverX = 204, serverY = 36, serverW = 108, serverH = 52;
    var serverCy = serverY + serverH / 2;

    clients.forEach(function (label, i) {
      var cy = 22 + i * 40;
      var y = cy - 14;
      var targetY = serverCy + (i - (clients.length - 1) / 2) * 12;
      var d = 'M90,' + cy + ' C142,' + cy + ' 148,' + targetY + ' 197,' + targetY;

      // Đường nối tĩnh + xung chạy 2 chiều
      svg.appendChild(svgEl('path', { class: 'ms-link', d: d }));
      svg.appendChild(svgEl('path', { class: 'ms-pulse', d: d }));
      svg.appendChild(svgEl('path', { class: 'ms-pulse ms-pulse--back', d: d }));

      // Mũi tên 2 đầu (Client <-> Server)
      svg.appendChild(svgEl('polygon', {
        class: 'ms-arrow',
        points: '85,' + cy + ' 92,' + (cy - 3.5) + ' 92,' + (cy + 3.5)
      }));
      svg.appendChild(svgEl('polygon', {
        class: 'ms-arrow',
        points: '202,' + targetY + ' 195,' + (targetY - 3.5) + ' 195,' + (targetY + 3.5)
      }));

      // Node Client
      var gClient = svgEl('g');
      gClient.appendChild(svgEl('rect', {
        class: 'ms-box',
        x: 8, y: y, width: 76, height: 28, rx: 8
      }));
      var tClient = svgEl('text', {
        class: 'ms-text',
        x: 46, y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central'
      });
      tClient.textContent = label;
      gClient.appendChild(tClient);
      svg.appendChild(gClient);
    });

    // Node Server trung tâm
    var gMain = svgEl('g', { class: 'ms-main' });
    gMain.appendChild(svgEl('rect', {
      class: 'ms-ring',
      x: serverX, y: serverY, width: serverW, height: serverH, rx: 11
    }));
    gMain.appendChild(svgEl('rect', {
      class: 'ms-box',
      x: serverX, y: serverY, width: serverW, height: serverH, rx: 11
    }));

    var tServer = svgEl('text', {
      class: 'ms-text',
      x: serverX + serverW / 2,
      y: flow.serverNote ? serverY + 20 : serverCy,
      'text-anchor': 'middle',
      'dominant-baseline': 'central'
    });
    tServer.textContent = flow.server || 'Server';
    gMain.appendChild(tServer);

    if (flow.serverNote) {
      var tSub = svgEl('text', {
        class: 'ms-text ms-sub',
        x: serverX + serverW / 2,
        y: serverY + 37,
        'text-anchor': 'middle',
        'dominant-baseline': 'central'
      });
      tSub.textContent = flow.serverNote;
      gMain.appendChild(tSub);
    }

    svg.appendChild(gMain);
    return svg;
  }

  /* --- Sơ đồ khối mini: hỗ trợ cả kiểu cột (cols) và kiểu sao (star) --- */
  function renderFlow(flow) {
    if (flow.type === 'star') return renderStar(flow);

    // Nhiều luồng (flow.rows) và/hoặc có dòng ghi chú (flow.note)
    if (flow.rows || flow.note) {
      var group = el('div', 'mini-flows');
      (flow.rows || [flow]).forEach(function (row) {
        var r = el('div', 'mf-row');
        if (row.label) r.appendChild(el('span', 'mf-row-label', row.label));
        r.appendChild(renderFlow({ cols: row.cols, main: row.main }));
        group.appendChild(r);
      });
      if (flow.note) group.appendChild(el('span', 'mf-note', flow.note));
      return group;
    }

    var wrap = el('div', 'mini-flow');
    (flow.cols || []).forEach(function (col, i) {
      if (i > 0) {
        var wire = el('span', 'mf-wire');
        wire.style.setProperty('--i', i - 1);
        wrap.appendChild(wire);
      }
      var c = el(
        'div',
        'mf-col' +
          (col.length > 1 ? ' mf-col--group' : '') +
          (i === flow.main ? ' mf-col--main' : '')
      );
      col.forEach(function (label) { c.appendChild(el('span', 'mf-node', label)); });
      wrap.appendChild(c);
    });
    return wrap;
  }

  /* --- Vẽ 1 thẻ dự án --- */
  function renderCard(p, index) {
    var card = el('article', 'project reveal spotlight' + (p.wide ? ' project--wide' : ''));
    card.dataset.projectId = p.id;
    card.dataset.year = p.date.slice(0, 4);               // dùng để nhóm theo năm
    card.dataset.category = p.category.join(' ');
    card.style.setProperty('--d', index % 3);

    var cover = el('div', 'project-cover');
    cover.setAttribute('aria-hidden', 'true');
    if (p.flow && p.flow.caption) cover.appendChild(el('span', 'cover-caption', p.flow.caption));
    if (p.flow) cover.appendChild(renderFlow(p.flow));

    var body = el('div', 'project-body');

    // Dòng phụ: chủ đề (màu) · loại đồ án · thời gian (+ nhãn "Mới nhất" nếu có)
    var meta = el('p', 'project-meta');
    var sep = function () { var d = el('span', 'meta-sep', '·'); d.setAttribute('aria-hidden', 'true'); return d; };
    var cat = filterById(p.category[0]);
    if (cat) { meta.appendChild(el('span', 'project-cat ' + (cat.tone || ''), cat.label)); meta.appendChild(sep()); }
    meta.appendChild(el('span', null, p.kind));
    meta.appendChild(sep());
    meta.appendChild(el('span', null, p.time));
    if (p.badge) meta.appendChild(el('span', 'project-status', p.badge));
    body.appendChild(meta);

    var titleId = 'p-' + p.id + '-title';
    var title = el('h3', 'project-title', p.title);
    title.id = titleId;
    body.appendChild(title);
    body.appendChild(el('p', 'project-desc', p.desc));
    body.appendChild(renderTech(p.tags));

    var foot = el('div', 'project-foot');
    var btn = el('button', 'btn btn--soft btn--sm', 'Xem chi tiết ');
    btn.type = 'button';
    btn.setAttribute('data-open-detail', '');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-describedby', titleId);
    btn.appendChild(svgIcon('i-arrow', 'icon-arrow'));
    foot.appendChild(btn);
    body.appendChild(foot);

    card.appendChild(cover);
    card.appendChild(body);
    return card;
  }

  /* --- Các khối chuyên biệt trong Modal chi tiết --- */
  var PENDING = 'Đang cập nhật';
  function detailSection(frag, heading, value) {
    frag.appendChild(el('h3', null, heading));
    if (value == null || (Array.isArray(value) && !value.length)) {
      frag.appendChild(el('p', 'detail-pending', PENDING));
    } else if (Array.isArray(value)) {
      var ul = el('ul');
      value.forEach(function (v) { ul.appendChild(el('li', null, v)); });
      frag.appendChild(ul);
    } else {
      frag.appendChild(el('p', null, value));
    }
  }

  // 1. Bản đồ bộ nhớ (SRAM / Reserved / UART MMIO + thanh ghi)
  function renderMemoryMap(regions) {
    var wrap = el('div', 'memmap');
    regions.forEach(function (r) {
      var row = el('div', 'mm-region mm--' + (r.type || 'mem'));
      row.appendChild(el('div', 'mm-addr', r.range));

      var body = el('div', 'mm-body');
      var head = el('div', 'mm-head');
      head.appendChild(el('span', 'mm-name', r.name));
      if (r.size) head.appendChild(el('span', 'mm-size', r.size));
      body.appendChild(head);

      if (r.note) body.appendChild(el('span', 'mm-note', r.note));

      if (Array.isArray(r.regs) && r.regs.length) {
        var regs = el('div', 'mm-regs');
        r.regs.forEach(function (reg) {
          var regRow = el('div', 'mm-reg');
          regRow.appendChild(el('span', 'mm-off', reg.off));
          regRow.appendChild(el('span', 'mm-reg-name', reg.name));
          regRow.appendChild(el('span', 'mm-acc', reg.access));
          regRow.appendChild(el('span', 'mm-reg-note', reg.note || ''));
          regs.appendChild(regRow);
        });
        body.appendChild(regs);
      }

      row.appendChild(body);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // 2. Lưới Kết quả signoff & FPGA (stat cards)
  function renderMetrics(metrics) {
    var grid = el('div', 'stat-grid');
    metrics.forEach(function (m) {
      var isPass = m.status === 'pass';
      var card = el('div', 'stat-card' + (isPass ? ' stat-card--pass' : ''));

      var label = el('div', 'stat-label');
      label.appendChild(el('span', null, m.label));
      if (isPass) label.appendChild(el('span', 'badge badge--pass', 'Passed'));
      card.appendChild(label);

      card.appendChild(el('div', 'stat-value', m.value != null ? m.value : (isPass ? 'Passed' : '—')));
      if (m.note) card.appendChild(el('div', 'stat-note', m.note));
      grid.appendChild(card);
    });
    return grid;
  }

  // 3. Thư viện ảnh dự án (./assets/projects/<id>/...) — tự ẩn nếu mảng rỗng
  function renderGallery(p) {
    var grid = el('div', 'gallery');
    var basePath = './assets/projects/' + p.id + '/';
    p.images.forEach(function (item) {
      var file = typeof item === 'string' ? item : item.file;
      var caption = typeof item === 'object' && item ? item.caption : '';
      if (!file) return;

      var src = basePath + file;
      var fig = el('figure');
      var link = el('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      var img = el('img');
      img.src = src;
      img.alt = caption || (p.title + ' – ' + file);
      img.loading = 'lazy';
      link.appendChild(img);
      fig.appendChild(link);

      if (caption) fig.appendChild(el('figcaption', null, caption));
      grid.appendChild(fig);
    });
    return grid;
  }

  function buildDetail(p) {
    var frag = document.createDocumentFragment();
    frag.appendChild(renderTech(p.tags));

    var meta = el('dl', 'detail-meta');
    [
      ['Tên tiếng Anh', p.titleEn],
      ['Loại', p.kind],
      ['Học phần', p.course],
      ['Thời gian', p.time],
      ['Thành viên', p.members]
    ].forEach(function (row) {
      if (!row[1]) return;
      meta.appendChild(el('dt', null, row[0]));
      meta.appendChild(el('dd', null, row[1]));
    });
    frag.appendChild(meta);

    if (p.overview) detailSection(frag, 'Tổng quan', p.overview);
    detailSection(frag, 'Mục tiêu', p.goal);

    // Sơ đồ khối: vẽ lại sơ đồ của thẻ + mô tả từng khối (nếu có)
    if (p.flow) {
      frag.appendChild(el('h3', null, 'Sơ đồ khối'));
      var diagram = el('div', 'detail-diagram');
      diagram.setAttribute('aria-hidden', 'true');
      if (p.flow.caption) diagram.appendChild(el('span', 'cover-caption', p.flow.caption));
      diagram.appendChild(renderFlow(p.flow));
      frag.appendChild(diagram);
      if (Array.isArray(p.blocks) && p.blocks.length) {
        var blockList = el('ul');
        p.blocks.forEach(function (b) { blockList.appendChild(el('li', null, b)); });
        frag.appendChild(blockList);
      }
    }

    if (p.content) detailSection(frag, 'Nội dung thực hiện', p.content);
    detailSection(frag, 'Linh kiện & công nghệ', p.tech);

    if (Array.isArray(p.memoryMap) && p.memoryMap.length) {
      frag.appendChild(el('h3', null, 'Bản đồ bộ nhớ'));
      frag.appendChild(renderMemoryMap(p.memoryMap));
    }

    if (Array.isArray(p.metrics) && p.metrics.length) {
      frag.appendChild(el('h3', null, 'Kết quả signoff'));
      frag.appendChild(renderMetrics(p.metrics));
    }

    if (Array.isArray(p.images) && p.images.length) {
      frag.appendChild(el('h3', null, 'Hình ảnh minh họa'));
      frag.appendChild(renderGallery(p));
    }

    detailSection(frag, 'Kết quả đạt được', p.results);
    detailSection(frag, 'Hạn chế', p.limits);
    detailSection(frag, 'Hướng phát triển', p.future);

    if (p.link) {
      var links = el('div', 'modal-links');
      var a = el('a', 'btn btn--outline btn--sm');
      a.href = p.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(svgIcon('i-github'));
      a.appendChild(document.createTextNode('Xem mã nguồn'));
      a.appendChild(el('span', 'sr-only', ' (mở tab mới)'));
      links.appendChild(a);
      frag.appendChild(links);
    }
    return frag;
  }

  /* --- Danh mục chung: dự án nổi bật (viết bằng HTML ở trang Dự án) + mảng projects, mới → cũ ---
     Dùng cho: số dự án theo lĩnh vực (data-filter-count, data-project-total) và "Dự án gần đây" ở Trang chủ.
     SỬA: nếu đổi tiêu đề / mô tả dự án nổi bật trong du-an.html thì sửa cả ở đây. */
  var FEATURED = [{
    id: 'fall', category: ['fpga'], time: '2026', kind: 'Cuộc thi MCU & FPGA mở rộng miền Trung',
    title: 'Thiết bị đeo ngực phát hiện té ngã',
    desc: 'Thiết bị nhỏ gọn đeo trước ngực, phát hiện té ngã và gửi cảnh báo kịp thời cho người thân. Mô hình 1D-CNN lượng tử hóa INT8 chạy trên FPGA Gowin, kết hợp cảm biến MPU6050, MCU SONiX và ESP32.'
  }];
  var RECENT_LIMIT = 4;   // SỬA: số dự án hiện ở mục "Dự án gần đây" của Trang chủ
  // Dự án có pinned: true đứng đầu (trước cả dự án nổi bật), còn lại xếp mới → cũ
  var sortedProjects = projects.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  var catalog = sortedProjects.filter(function (p) { return p.pinned; })
    .concat(FEATURED, sortedProjects.filter(function (p) { return !p.pinned; }));
  function countIn(id) {
    return catalog.filter(function (p) { return id === 'all' || p.category.indexOf(id) !== -1; }).length;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-filter-count]'), function (n) {
    n.textContent = countIn(n.getAttribute('data-filter-count'));
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-project-total]'), function (n) {
    n.textContent = catalog.length;
  });

  // Trang chủ: mỗi dự án là 1 dòng (chủ đề · tiêu đề · mô tả · "Đọc chi tiết" → mở thẳng chi tiết ở trang Dự án)
  function renderPost(p) {
    var href = 'du-an.html#' + p.id;
    var post = el('article', 'post-row reveal');
    var cat = filterById(p.category[0]);
    if (cat) post.appendChild(el('p', 'post-topic ' + (cat.tone || ''), cat.label));
    var h = el('h3', 'post-title');
    var a = el('a', null, p.title);
    a.href = href;
    h.appendChild(a);
    post.appendChild(h);
    post.appendChild(el('p', 'post-desc', p.desc));
    post.appendChild(el('p', 'post-meta', p.kind + ' · ' + p.time));
    var more = el('a', 'post-more', 'Đọc chi tiết');
    more.href = href;
    more.appendChild(el('span', 'sr-only', ' về ' + p.title));
    more.appendChild(svgIcon('i-arrow'));
    post.appendChild(more);
    return post;
  }
  var recentList = document.getElementById('recent-projects');
  if (recentList) {
    catalog.slice(0, RECENT_LIMIT).forEach(function (p) { recentList.appendChild(renderPost(p)); });
  }

  // Trang Dự án: chèn các thẻ theo thứ tự mới → cũ
  var projectsGrid = document.getElementById('projects-grid');
  var projectsById = {};
  (function () {
  if (!projectsGrid) return;
  var firstStaticCard = projectsGrid.firstElementChild;   // dự án nổi bật viết bằng HTML
  sortedProjects.forEach(function (p, i) {
    projectsById[p.id] = p;
    var card = renderCard(p, i);
    if (p.pinned && firstStaticCard) projectsGrid.insertBefore(card, firstStaticCard);   // pinned: lên đầu nhóm năm
    else projectsGrid.appendChild(card);
  });

  // Nhóm theo năm: chèn dải tiêu đề năm trước thẻ đầu tiên của mỗi năm
  var yearDividers = [];
  var lastYear = null;
  Array.prototype.slice.call(projectsGrid.querySelectorAll('.project')).forEach(function (card) {
    var year = card.dataset.year;
    if (!year || year === lastYear) return;
    lastYear = year;
    var divider = el('div', 'year-divider');
    divider.dataset.year = year;
    divider.appendChild(el('span', 'year-num', year));
    var line = el('span', 'year-line');
    line.setAttribute('aria-hidden', 'true');
    divider.appendChild(line);
    divider.appendChild(el('span', 'year-count'));
    projectsGrid.insertBefore(divider, card);
    yearDividers.push(divider);
  });

  /* --- Bộ lọc & nút Xem thêm / Thu gọn --- */
  var filterBar = document.getElementById('project-filters');
  var projectsStatus = document.getElementById('projects-status');
  var projectsEmpty = document.getElementById('projects-empty');
  var moreWrap = document.getElementById('projects-more-wrap');
  var moreBtn = document.getElementById('projects-more');
  var moreLabel = document.getElementById('projects-more-label');
  var projectCards = Array.prototype.slice.call(projectsGrid.querySelectorAll('.project'));

  var activeFilter = 'all';
  var isExpanded = false;

  function inFilter(card, id) {
    return id === 'all' || (' ' + (card.dataset.category || '') + ' ').indexOf(' ' + id + ' ') !== -1;
  }

  PROJECT_FILTERS.forEach(function (f, i) {
    var count = projectCards.filter(function (c) { return inFilter(c, f.id); }).length;
    var chip = el('button', 'filter-chip ' + (f.tone || ''), f.label);
    chip.type = 'button';
    chip.dataset.filter = f.id;
    chip.setAttribute('aria-pressed', String(i === 0));
    var num = el('span', 'filter-count', String(count));
    num.setAttribute('aria-hidden', 'true');
    chip.appendChild(num);
    chip.appendChild(el('span', 'sr-only', ' (' + count + ' dự án)'));
    filterBar.appendChild(chip);
  });

  function updateProjectsView(animate) {
    var matched = projectCards.filter(function (c) { return inFilter(c, activeFilter); });
    var total = matched.length;
    var hasMore = total > PROJECT_LIMIT;
    var visibleCount = (hasMore && !isExpanded) ? PROJECT_LIMIT : total;

    projectCards.forEach(function (card) { card.hidden = true; });

    matched.forEach(function (card, idx) {
      var show = idx < visibleCount;
      card.hidden = !show;
      if (!show) return;
      if (animate) {                         // lọc / Xem thêm: hiện ngay kèm hiệu ứng
        card.classList.add('is-visible');    // (lúc tải trang: để IntersectionObserver hiện dần khi cuộn tới)
        card.classList.remove('is-entering');
        void card.offsetWidth;
        card.classList.add('is-entering');
      }
    });

    filterBar.querySelectorAll('.filter-chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.filter === activeFilter));
    });

    if (moreWrap && moreBtn && moreLabel) {
      moreWrap.hidden = !hasMore;
      moreBtn.setAttribute('aria-expanded', String(isExpanded));
      var extra = total - PROJECT_LIMIT;
      moreLabel.textContent = isExpanded ? 'Thu gọn' : 'Xem thêm (' + extra + ' dự án)';
    }

    // Dải năm: ẩn khi năm đó không còn thẻ nào hiện; cập nhật số dự án theo bộ lọc
    yearDividers.forEach(function (d) {
      var inYear = matched.filter(function (c) { return c.dataset.year === d.dataset.year; });
      var anyShown = inYear.some(function (c) { return !c.hidden; });
      d.hidden = !anyShown;
      d.querySelector('.year-count').textContent = inYear.length + ' dự án';
      if (anyShown && animate) {
        d.classList.remove('is-entering');
        void d.offsetWidth;
        d.classList.add('is-entering');
      }
    });

    projectsEmpty.hidden = total > 0;
    projectsStatus.textContent = 'Đang hiển thị ' + visibleCount + ' trên ' + total + ' dự án';
  }

  filterBar.addEventListener('click', function (e) {
    var chip = e.target.closest('.filter-chip');
    if (!chip || chip.dataset.filter === activeFilter) return;
    activeFilter = chip.dataset.filter;
    isExpanded = false;
    updateProjectsView(true);
  });

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      isExpanded = !isExpanded;
      updateProjectsView(true);
    });
  }

  // Lọc sẵn theo đường dẫn, vd: du-an.html?nhom=cpu (liên kết từ Trang chủ và trang Giới thiệu)
  var preset = (location.search.match(/[?&]nhom=([a-z]+)/) || [])[1];
  if (preset && filterById(preset)) activeFilter = preset;

  // Khởi tạo trạng thái ban đầu (hiện 5 dự án đầu + nút Xem thêm)
  updateProjectsView(false);
  })();

  /* ---------- Hiệu ứng hiện dần khi cuộn ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if (!hasIO || reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealer.observe(el); });
  }

  /* ---------- Hiệu ứng theo chuột (chỉ trên máy có chuột, tắt khi giảm chuyển động) ---------- */
  if (finePointer && !reduceMotion) {
    // Hero: nghiêng 3D ảnh đại diện, nền & nhãn dịch nhẹ, vầng sáng theo con trỏ
    var hero = document.querySelector('.hero');
    var heroRaf = 0, hx = 0.5, hy = 0.5;
    if (hero) hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      hx = (e.clientX - r.left) / r.width;
      hy = (e.clientY - r.top) / r.height;
      if (heroRaf) return;
      heroRaf = requestAnimationFrame(function () {
        heroRaf = 0;
        hero.style.setProperty('--px', (hx - 0.5).toFixed(3));
        hero.style.setProperty('--py', (hy - 0.5).toFixed(3));
        hero.style.setProperty('--hx', (hx * 100).toFixed(1) + '%');
        hero.style.setProperty('--hy', (hy * 100).toFixed(1) + '%');
        hero.classList.add('is-pointer');
      });
    });
    if (hero) hero.addEventListener('pointerleave', function () {
      hero.style.setProperty('--px', 0);
      hero.style.setProperty('--py', 0);
      hero.classList.remove('is-pointer');
    });

    // Thẻ .spotlight: vầng sáng đi theo con trỏ
    var spotEl = null, spotX = 0, spotY = 0, spotRaf = 0;
    document.addEventListener('pointermove', function (e) {
      spotEl = e.target.closest ? e.target.closest('.spotlight') : null;
      spotX = e.clientX; spotY = e.clientY;
      if (!spotEl || spotRaf) return;
      spotRaf = requestAnimationFrame(function () {
        spotRaf = 0;
        if (!spotEl) return;
        var r = spotEl.getBoundingClientRect();
        spotEl.style.setProperty('--mx', (spotX - r.left) + 'px');
        spotEl.style.setProperty('--my', (spotY - r.top) + 'px');
      });
    }, { passive: true });

    // Nút [data-magnetic]: hơi "hút" theo con trỏ
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) * 0.18;
        var dy = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
      });
      btn.addEventListener('pointerleave', function () { btn.style.translate = ''; });
    });
  }

  /* ---------- Hộp thoại "Xem chi tiết" dự án ---------- */
  var dialog = document.getElementById('project-dialog');
  var dialogTitle = document.getElementById('dialog-title');
  var dialogBody = document.getElementById('dialog-body');
  var lastTrigger = null;

  function openProject(card, trigger) {
    if (!dialog || !card || typeof dialog.showModal !== 'function') return;
    var data = projectsById[card.dataset.projectId];
    var tpl = card.querySelector('template.project-detail');
    if (!data && !tpl) return;

    dialogTitle.textContent = card.querySelector('.project-title').textContent.trim();
    dialogBody.innerHTML = '';
    if (data) {
      dialogBody.appendChild(buildDetail(data));
    } else {
      var tech = card.querySelector('.tech');
      if (tech) dialogBody.appendChild(tech.cloneNode(true));
      dialogBody.appendChild(tpl.content.cloneNode(true));
    }

    lastTrigger = trigger;
    dialog.showModal();
    root.classList.add('modal-open');
    dialogBody.scrollTop = 0;
    // Ghi #id lên thanh địa chỉ để có thể gửi link thẳng tới dự án này
    if (card.dataset.projectId && history.replaceState) history.replaceState(null, '', '#' + card.dataset.projectId);
  }

  if (dialog) {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open-detail]');
      if (btn) openProject(btn.closest('.project'), btn);
    });
    dialog.querySelector('[data-close-dialog]').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () {
      root.classList.remove('modal-open');
      if (location.hash && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      if (lastTrigger) lastTrigger.focus();
      lastTrigger = null;
    });

    // Focus trap: Tab / Shift+Tab chỉ di chuyển trong hộp thoại
    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusables = dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Mở thẳng chi tiết khi đường dẫn có #id-dự-án (vd: du-an.html#tilelink, link từ Trang chủ / Giới thiệu)
    var openFromHash = function () {
      var id = decodeURIComponent(location.hash.slice(1)).replace(/[^a-z0-9-]/gi, '');
      if (!id || !projectsGrid || dialog.open) return;
      var card = projectsGrid.querySelector('.project[data-project-id="' + id + '"]');
      if (card) openProject(card, null);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  }

  /* ---------- Sao chép email ---------- */
  var toast = document.getElementById('toast');
  var toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () { showToast(btn.getAttribute('data-copy-msg') || 'Đã sao chép!'); };
      var fail = function () {
        if (fallbackCopy(text)) done();
        else showToast('Không sao chép được, bạn hãy chọn và sao chép thủ công nhé.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fail);
      } else {
        fail();
      }
    });
  });

  /* ---------- Các nhân vật Clash of Clans chạy dọc trang ----------
     - Mỗi trang có 1 "đường chạy" viết sẵn trong HTML (chứa các nhân vật của trang đó);
       mục nào có thuộc tính data-lane-section thì JS tạo thêm đường chạy ở đáy mục đó.
     - Nhân vật tự đổi trạng thái: chạy → dừng / tấn công / quay đầu → chạy tiếp.
     - Chạy ra mép phải → sang mục kế tiếp; ra mép trái → về mục phía trên.
     - Bấm vào nhân vật: Barbarian lộn vòng, Giant dậm đất, Wizard bắn cầu lửa, Hog Rider phóng sang mục khác.
     SỬA: tốc độ, câu hô, khả năng đi sang mục khác (roam) trong bảng KIND. */
  (function () {
    var heroLane = document.querySelector('.barb-lane');
    if (!heroLane || reduceMotion) return;   // giảm chuyển động: các nhân vật đứng yên ở đầu trang

    var KIND = {
      barb:   { speed: [70, 110],  run: [2500, 6000], attack: 750, jump: 950,  roam: 0.25, dust: 380,
                cries: ['Xông lên!', 'Aaargh!', 'Hây da!', 'Barbarian!!'] },
      giant:  { speed: [30, 44],   run: [3500, 7000], attack: 850, jump: 1100, roam: 0.15, dust: 380,
                cries: ['Ùm!', 'Hự!', 'Rầm rầm!', 'Tránh ra!'] },
      wizard: { speed: [45, 65],   run: [3000, 6000], attack: 900, jump: 950,  roam: 0.2,  dust: 0,
                cries: ['Hỏa cầu!', 'Bùm!', 'Nóng nè!', 'Phép thuật!'] },
      hog:    { speed: [150, 200], run: [2000, 4500], attack: 800, jump: 900,  roam: 0.7,  dust: 140,
                cries: ['Hog Riderrr!', 'Yeehaw!', 'Ụt ịt!', 'Tránh đường!'] },
      pekka:  { speed: [28, 40],   run: [3500, 7000], attack: 900, jump: 950,  roam: 0.12, dust: 450,
                cries: ['P.E.K.K.A!', 'Bươm bướm...', 'Rắc!', 'Chém!'] },
      miner:  { speed: [60, 90],   run: [2500, 5000], attack: 900, jump: 950,  roam: 0.5,  dust: 110,
                cries: ['Đào nè!', 'Ló đầu!', 'Vàng đâu?', 'Hì hục!'] },
      goblin: { speed: [120, 160], run: [2000, 4500], attack: 900, jump: 700,  roam: 0.45, dust: 220,
                cries: ['Vàng!!', 'Hí hí hí', 'Của tui!', 'Giàu rồi!'] },
      minion: { speed: [80, 110],  run: [2500, 5000], attack: 900, jump: 800,  roam: 0.35, dust: 0,
                cries: ['Grừ!', 'Vèo vèo~', 'Phụt!', 'Bay nè!'] },
      witch:  { speed: [40, 55],   run: [3000, 6000], attack: 1100, jump: 950, roam: 0.2,  dust: 0,
                cries: ['Trỗi dậy!', 'Hỡi các bộ xương...', 'Hi hi hi', 'Đội quân bóng tối!'] },
      skeleton: { speed: [100, 140], run: [1200, 2500], attack: 750, jump: 950, roam: 0, dust: 260,
                cries: ['Lạch cạch!', 'Rắc rắc!'] },
      wb:     { speed: [130, 170], run: [2500, 5000], attack: 1300, jump: 950, roam: 0.45, dust: 200,
                cries: ['Cháy nè!', 'Bùm bùm!', 'Tránh ra!!', 'Đến lượt tui!'] },
      balloon: { speed: [30, 45],  run: [3500, 7000], attack: 800, jump: 950,  roam: 0.4,  dust: 0,
                cries: ['Thả bom!', 'Bom đây!', 'Vù vù~', 'Cẩn thận bên dưới!'] },
      dragon: { speed: [45, 65],   run: [3000, 6000], attack: 1200, jump: 950, roam: 0.35, dust: 0,
                cries: ['Grào!!', 'Phun lửa!', 'Khè khè~', 'Rồng tới!'] },
      bowler: { speed: [45, 60],   run: [3000, 6000], attack: 900, jump: 950,  roam: 0.25, dust: 380,
                cries: ['Bowling!!', 'Lăn nè!', 'Hự!', 'Strike!'] },
      druid:  { speed: [26, 38],   run: [2500, 5000], attack: 1000, jump: 1000, roam: 0.2, dust: 420,
                cries: ['Hồi máu nè!', 'Cố lên nào!', 'Thiên nhiên chữa lành~', 'Druid đây!'] }
    };
    // Quân bay: độ cao [máy tính, điện thoại] và biên độ lượn; ở mục đầu trang bay thấp hơn cho khỏi che chữ
    var FLY = { minion: { base: [48, 34], amp: 12, period: 620 }, balloon: { base: [52, 30], amp: 7, period: 1400 },
                dragon: { base: [38, 26], amp: 6, period: 1100 } };
    var WB_RESPAWN = 3500;      // SỬA: Wall Breaker nổ xong bao lâu (ms) thì con mới chạy vào
    var SKELETON_LIFE = 5000;   // SỬA: Bộ xương tồn tại bao lâu (ms) rồi rã rời
    var SKELETON_MAX = 2;       // SỬA: mỗi Phù thủy gọi tối đa bao nhiêu Bộ xương cùng lúc
    var GOBLIN_STARTLE = ['Á! Vàng của tui!', 'Chạy mau!', 'Bắt hông được đâu!'];

    // Tạo đường chạy ở đáy các mục có data-lane-section (trừ mục đã có sẵn đường chạy trong HTML)
    var lanes = [heroLane];
    Array.prototype.forEach.call(document.querySelectorAll('[data-lane-section]'), function (sec) {
      if (sec.contains(heroLane)) return;
      var l = document.createElement('div');
      l.className = 'barb-lane barb-lane--section is-live';
      l.setAttribute('aria-hidden', 'true');
      sec.classList.add('has-lane');
      sec.appendChild(l);
      lanes.push(l);
    });
    lanes.forEach(function (l) { l._w = 0; l._vis = false; });
    function laneById(id) {
      var sec = document.getElementById(id);
      return sec ? sec.querySelector('.barb-lane--section') : null;
    }

    var units = Array.prototype.map.call(heroLane.querySelectorAll('.barb'), function (el, i) {
      var kind = el.classList.contains('barb--giant') ? 'giant'
               : el.classList.contains('barb--wizard') ? 'wizard'
               : el.classList.contains('barb--hog') ? 'hog'
               : el.classList.contains('barb--pekka') ? 'pekka'
               : el.classList.contains('barb--miner') ? 'miner'
               : el.classList.contains('barb--goblin') ? 'goblin'
               : el.classList.contains('barb--minion') ? 'minion'
               : el.classList.contains('barb--witch') ? 'witch'
               : el.classList.contains('barb--wb') ? 'wb'
               : el.classList.contains('barb--balloon') ? 'balloon'
               : el.classList.contains('barb--dragon') ? 'dragon'
               : el.classList.contains('barb--bowler') ? 'bowler'
               : el.classList.contains('barb--druid') ? 'druid' : 'barb';
      return { el: el, bubble: el.querySelector('.barb-bubble'), kind: kind, k: KIND[kind],
               lane: heroLane, dir: i % 2 ? -1 : 1,
               base: Number(el.getAttribute('data-face')) || 1,   // hướng nhìn của ảnh gốc
               x: 0, w: 0, h: 0, speed: 0, mode: '', until: 0, dustAt: 0, timer: 0,
               roam: false, boost: 0, alt: 0, modeAt: 0, phase: Math.random() * 6, skeletons: [] };
    });
    // Bầy Goblin: con đầu tiên làm trưởng bầy, các con sau bám theo (slot = thứ tự trong hàng)
    var goblins = units.filter(function (u) { return u.kind === 'goblin'; });
    goblins.forEach(function (g, i) { if (i) { g.leader = goblins[0]; g.slot = i; } });
    var running = false;

    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function measure() {
      lanes.forEach(function (l) { l._w = l.clientWidth; });
      units.forEach(function (u) { u.w = u.el.offsetWidth; u.h = u.el.offsetHeight; });
    }
    function mobile() { return heroLane._w < 600; }
    function face(u) { u.el.style.setProperty('--face', u.dir * u.base); }
    function say(u, text) {
      u.bubble.textContent = text;
      // Dịch bong bóng vào trong nếu nhân vật đang sát mép (tránh bị cắt chữ)
      var bw = u.bubble.offsetWidth, W = u.lane._w || u.lane.clientWidth;
      var left = u.x + u.w / 2 - bw / 2, shift = 0;
      if (left < 4) shift = 4 - left;
      else if (left + bw > W - 4) shift = W - 4 - (left + bw);
      u.bubble.style.marginLeft = shift.toFixed(0) + 'px';
      u.bubble.classList.add('is-shown');
      clearTimeout(u.timer);
      u.timer = setTimeout(function () { u.bubble.classList.remove('is-shown'); }, 1300);
    }
    function setMode(u, mode, now) {
      // Miner đang ở dưới đất mà dừng lại → trồi lên, đất văng tung toé
      if (u.kind === 'miner' && u.mode === 'run' && mode !== 'run') popDirt(u);
      u.mode = mode;
      u.modeAt = now;
      u.el.classList.remove('is-run', 'is-idle', 'is-attack', 'is-jump', 'is-rise', 'is-gone');
      u.el.classList.add('is-' + mode);
      if (mode === 'run') {
        u.until = now + rand(u.k.run[0], u.k.run[1]);
        u.speed = rand(u.k.speed[0], u.k.speed[1]) * (mobile() ? 0.65 : 1);   // px/giây
        u.roam = u.roam || Math.random() < u.k.roam;   // lần chạy này có đi sang mục khác không
      } else if (mode === 'idle') {
        u.until = now + rand(1000, 2600);
        if (u.kind === 'goblin' && !u.leader && Math.random() < 0.5) say(u, 'Suỵt...');   // rón rén
      } else if (mode === 'attack') {
        u.until = now + u.k.attack;
        if (u.kind === 'wizard') setTimeout(function () { if (u.mode === 'attack') castFireball(u); }, 400);
        if (u.kind === 'hog') setTimeout(function () { if (u.mode === 'attack') hammer(u); }, 420);
        if (u.kind === 'pekka') setTimeout(function () { if (u.mode === 'attack') pekkaSlash(u); }, 460);
        if (u.kind === 'miner') setTimeout(function () { if (u.mode === 'attack') popDirt(u, true); }, 560);
        if (u.kind === 'goblin') setTimeout(function () { if (u.mode === 'attack') coinFountain(u, 3); }, 380);
        if (u.kind === 'minion') setTimeout(function () { if (u.mode === 'attack') spit(u); }, 430);   // lúc bổ nhào thấp nhất
        if (u.kind === 'witch') setTimeout(function () { if (u.mode === 'attack') summon(u); }, 550);  // lúc giơ gậy cao nhất
        if (u.kind === 'balloon') setTimeout(function () { if (u.mode === 'attack') dropBomb(u); }, 300);
        if (u.kind === 'dragon') setTimeout(function () { if (u.mode === 'attack') breathFire(u); }, 380);   // lúc chúi đầu xuống
        if (u.kind === 'bowler') setTimeout(function () { if (u.mode === 'attack') throwBoulder(u); }, 450); // lúc vung tay tới
        if (u.kind === 'druid') setTimeout(function () { if (u.mode === 'attack') druidHeal(u); }, 450);    // lúc giơ gậy cao nhất
        if (u.kind === 'wb') {                                 // Wall Breaker: đếm ngược 3-2-1 rồi nổ
          say(u, '3');
          setTimeout(function () { if (u.mode === 'attack') say(u, '2'); }, 430);
          setTimeout(function () { if (u.mode === 'attack') say(u, '1'); }, 860);
          setTimeout(function () { if (u.mode === 'attack') explodeWB(u); }, 1260);
        }
      } else if (mode === 'gone') {
        u.until = now + WB_RESPAWN;                            // Wall Breaker đã nổ, chờ con mới
      } else if (mode === 'rise') {
        u.until = now + 650;                                   // Bộ xương đang chui lên khỏi đất
      } else {
        u.until = now + u.k.jump;
      }
    }
    function nextMode(u, now) {
      if (u.mode === 'gone') { respawnWB(u, now); return; }
      var r = Math.random();
      if (u.mode === 'run' && u.kind === 'druid') {          // Druid ưu tiên hồi máu cho đồng đội
        if (r < 0.6) { setMode(u, 'attack', now); if (Math.random() < 0.35) say(u, pick(u.k.cries)); }
        else if (r < 0.85) setMode(u, 'idle', now);
        else { u.dir *= -1; face(u); setMode(u, 'run', now); }
        return;
      }
      if (u.mode === 'run') {
        if (r < 0.4) setMode(u, 'idle', now);
        else if (r < 0.75) { setMode(u, 'attack', now); if (Math.random() < 0.35) say(u, pick(u.k.cries)); }
        else { u.dir *= -1; face(u); setMode(u, 'run', now); }
      } else if (u.mode === 'idle') {
        if (r < 0.5) { u.dir *= -1; face(u); }
        setMode(u, 'run', now);
      } else setMode(u, 'run', now);
    }

    // Đi sang mục khác: phải → mục kế tiếp, trái → mục phía trên
    function travel(u) {
      var idx = lanes.indexOf(u.lane);
      var target = lanes[idx + (u.dir > 0 ? 1 : -1)];
      u.roam = false;
      if (!target) return false;
      u.bubble.classList.remove('is-shown');
      target.appendChild(u.el);
      u.lane = target;
      u.x = u.dir > 0 ? -u.w : target._w;
      return true;
    }

    // Hiệu ứng phụ: chỉ tạo khi đường chạy đang hiện trên màn hình
    function spawn(lane, cls, x, y) {
      var s = document.createElement('span');
      s.className = cls;
      s.style.left = x.toFixed(1) + 'px';
      s.style.bottom = y.toFixed(1) + 'px';
      s.addEventListener('animationend', function (e) {
        if (e.target === s && cls !== 'fireball' && cls !== 'gold-coin') s.remove();   // vàng tự xóa khi mờ hẳn / được nhặt
      });
      lane.appendChild(s);
      return s;
    }
    function dust(u, left, dx, big) {
      if (!u.lane._vis) return;
      big = big || u.kind === 'giant';
      if (left == null) left = u.x + u.w * (0.5 - u.dir * 0.25) - (big ? 12 : 7);
      var d = spawn(u.lane, 'barb-dust' + (big ? ' barb-dust--big' : '') + (u.kind === 'miner' ? ' barb-dust--dirt' : ''), left, -2);
      d.style.setProperty('--dx', (dx == null ? -u.dir * 16 : dx) + 'px');
    }
    function knockNear(lane, x, range, except) {
      var now = performance.now();
      units.forEach(function (u) {
        // P.E.K.K.A quá nặng, Minion đang bay → không bị hất
        if (u === except || u.lane !== lane || u.mode === 'jump' || u.mode === 'gone' || u.dead) return;
        if (u.kind === 'pekka' || u.kind === 'minion' || u.kind === 'witch' || u.kind === 'balloon' || u.kind === 'dragon') return;   // quá nặng / đang bay
        if (Math.abs((u.x + u.w / 2) - x) >= range) return;
        if (u.kind === 'skeleton') collapse(u);                // Bộ xương trúng đòn thì rã luôn
        else if (u.kind === 'wb') explodeWB(u);                // Wall Breaker trúng đòn thì nổ dây chuyền
        else setMode(u, 'jump', now);
      });
    }
    function quake(lane, level) {
      lane.classList.remove('is-quake');
      void lane.offsetWidth;
      lane.classList.add('is-quake');
      if (level && lane._vis) shakeScreen(level);
    }
    // Rung màn hình: vụ nổ to hơn sẽ không bị vụ nhỏ hơn cắt ngang
    var mainEl = document.getElementById('noi-dung');
    var SHAKE_RANK = { sm: 1, md: 2, lg: 3 }, shakeRank = 0, shakeUntil = 0;
    function shakeScreen(level) {
      if (!mainEl) return;
      var now = performance.now();
      if (now < shakeUntil && SHAKE_RANK[level] < shakeRank) return;
      shakeRank = SHAKE_RANK[level];
      shakeUntil = now + (level === 'lg' ? 650 : level === 'md' ? 450 : 350);
      mainEl.classList.remove('shake-sm', 'shake-md', 'shake-lg');
      void mainEl.offsetWidth;
      mainEl.classList.add('shake-' + level);
    }
    if (mainEl) mainEl.addEventListener('animationend', function (e) {
      if (e.target === mainEl) mainEl.classList.remove('shake-sm', 'shake-md', 'shake-lg');
    });

    // Giant dậm đất: rung cả đường chạy, tung bụi, hất các nhân vật đứng gần
    function slam(g) {
      quake(g.lane, 'md');
      for (var k = -2; k <= 2; k++) if (k) dust(g, g.x + g.w / 2 + k * g.w * 0.22 - 12, k * 18, true);
      knockNear(g.lane, g.x + g.w / 2, 170, g);
    }
    // Hog Rider nện búa xuống đất phía trước
    function hammer(u) {
      var fx = u.x + u.w * (u.dir > 0 ? 0.85 : 0.15);
      quake(u.lane, 'sm');
      for (var k = 0; k < 3; k++) dust(u, fx - 10 + rand(-8, 8), rand(-18, 18), true);
      knockNear(u.lane, fx, 50, u);
    }
    // P.E.K.K.A chém: tia lửa điện tím bắn ra phía trước, hất nhân vật đứng trước mặt
    function pekkaSlash(u) {
      var fx = u.x + u.w * (u.dir > 0 ? 0.95 : 0.05);
      if (u.lane._vis) {
        for (var k = 0; k < 9; k++) {
          var s = spawn(u.lane, 'pekka-spark', fx, rand(14, u.h * 0.7));
          s.style.setProperty('--ex', (u.dir * rand(10, 46)).toFixed(1) + 'px');
          s.style.setProperty('--ey', rand(-26, 18).toFixed(1) + 'px');
        }
      }
      knockNear(u.lane, fx, 70, u);
    }
    // Miner trồi lên / xúc đất: cục đất văng ra hình quạt
    function popDirt(u, forward) {
      if (!u.lane._vis) return;
      var cx = u.x + u.w * (forward ? (u.dir > 0 ? 0.75 : 0.25) : 0.5);
      for (var k = 0; k < 7; k++) {
        var a = forward ? (u.dir > 0 ? rand(0.15, 1.1) : rand(2.0, 3.0)) : Math.PI * (k / 6);
        var r = rand(18, 40);
        var c = spawn(u.lane, 'dirt-clod', cx, 4);
        c.style.setProperty('--ex', (Math.cos(a) * r).toFixed(1) + 'px');
        c.style.setProperty('--ey', (-Math.sin(a) * r).toFixed(1) + 'px');
      }
    }
    /* ----- Vàng của Goblin: rơi xuống đất, rê chuột/chạm để nhặt (hiện "+1") ----- */
    try { localStorage.removeItem('goblin-gold'); } catch (e) { /* dọn số đếm cũ (đã bỏ bộ đếm) */ }
    function collect(coin) {
      if (coin.classList.contains('is-collected')) return;
      coin.classList.add('is-collected');
      var plus = spawn(coin.parentNode, 'coin-plus', parseFloat(coin.style.left), 18);
      plus.textContent = '+1';
    }
    function dropCoin(lane, x, fromY, dx) {
      if (!lane._vis) return;
      var coins = lane.querySelectorAll('.gold-coin');
      if (coins.length > 14) coins[0].remove();                     // giới hạn số vàng trên mỗi đường
      var c = spawn(lane, 'gold-coin', Math.max(8, Math.min(lane._w - 8, x)), 2);
      c.style.setProperty('--h', fromY.toFixed(0) + 'px');
      c.style.setProperty('--dx', dx.toFixed(0) + 'px');
      c.addEventListener('animationend', function (e) {
        if (e.animationName === 'coin-fade' || e.animationName === 'coin-collect') c.remove();
      });
      c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') collect(c); });
      c.addEventListener('click', function () { collect(c); });
    }
    function coinFromBag(u) {                                       // rơi từ túi khi đang chạy
      dropCoin(u.lane, u.x + u.w * (u.dir > 0 ? 0.42 : 0.58), u.h * 0.5, -u.dir * rand(4, 14));
    }
    function coinFountain(u, n) {                                   // tung vàng ra hai bên
      for (var k = 0; k < n; k++) {
        dropCoin(u.lane, u.x + u.w / 2 + rand(-40, 40), u.h * 0.9 + rand(10, 30), rand(-14, 14));
      }
    }
    // Bấm vào 1 Goblin: cả bầy giật mình, vàng văng ra, rồi bỏ chạy sang mục khác
    function startle(u) {
      var L = u.leader || u, now = performance.now();
      goblins.forEach(function (g) {
        if (g.lane !== L.lane && g !== u) return;
        setMode(g, 'jump', now);
      });
      coinFountain(u, 5);
      say(u, pick(GOBLIN_STARTLE));
      var li = lanes.indexOf(L.lane);
      if (!lanes[li + (L.dir > 0 ? 1 : -1)]) { L.dir *= -1; face(L); }
      L.boost = now + 3200;
      L.roam = true;
    }
    // Goblin theo sau: bám đúng chỗ phía sau trưởng bầy, trưởng bầy sang mục khác thì đuổi theo
    function follow(u, now, dt) {
      var L = u.leader;
      if (u.mode === 'jump' && now < u.until) return;
      var li = lanes.indexOf(L.lane), mi = lanes.indexOf(u.lane);
      var sp = Math.max(L.speed, 110) * (now < L.boost ? 1.8 : 1) * 1.25;
      if (li !== mi) {
        u.dir = li > mi ? 1 : -1; face(u);
        if (u.mode !== 'run') setMode(u, 'run', now);
        u.x += u.dir * sp * dt;
        if (u.x < -u.w - 4 || u.x > u.lane._w + 4) travel(u);
      } else {
        var target = L.x - L.dir * u.w * 0.75 * u.slot;
        var diff = target - u.x;
        var far = Math.abs(diff) > 18;
        var stepMax = (L.mode === 'idle' && !far ? L.speed * 0.22 : sp) * dt;
        u.x += Math.sign(diff) * Math.min(Math.abs(diff), stepMax);
        var wantDir = far ? (diff > 0 ? 1 : -1) : L.dir;
        if (wantDir !== u.dir) { u.dir = wantDir; face(u); }
        var want = far ? 'run' : L.mode;
        if (u.mode !== want) setMode(u, want, now);
      }
      if (u.mode === 'run' && now >= u.dustAt) { dust(u); u.dustAt = now + u.k.dust; }
      if (u.mode === 'run' && now >= (u.coinAt || 0)) { coinFromBag(u); u.coinAt = now + rand(700, 1600); }
    }

    // Đặt vị trí nhân vật; Minion bay: độ cao lượn sóng, bổ nhào khi tấn công, bóng in dưới đất
    function place(u, now, dt) {
      var y = 0, f = FLY[u.kind];
      if (f) {
        var base = f.base[mobile() ? 1 : 0] * (u.lane === heroLane ? 0.6 : 1), target;
        if (u.mode === 'attack' && u.kind === 'minion') {      // Minion bổ nhào
          var p = Math.min(1, (now - u.modeAt) / u.k.attack);
          target = base - (base - 14) * Math.sin(p * Math.PI);
        } else if (u.mode === 'attack' && u.kind === 'balloon') {   // Balloon thả bom xong thì bốc cao hơn chút
          target = base + (now - u.modeAt > 320 ? 10 : 0);
        } else if (u.mode === 'attack') {                      // Dragon giữ độ cao khi phun lửa
          target = base;
        } else if (u.mode === 'idle') target = base + Math.sin(now / (f.period * 0.6) + u.phase) * f.amp * 0.5;
        else target = base + Math.sin(now / f.period + u.phase) * f.amp;
        u.alt += (target - u.alt) * Math.min(1, dt * (u.kind === 'balloon' ? 3 : 8));
        y = u.alt;
        u.el.style.setProperty('--alt', y.toFixed(1) + 'px');
        u.el.style.setProperty('--sh', Math.max(0.35, 1 - y / 110).toFixed(2));
      }
      u.el.style.translate = u.x.toFixed(1) + 'px ' + (-y).toFixed(1) + 'px';
    }
    // Dragon phun lửa: luồng lửa hình nón từ miệng chéo xuống đất, chỗ chạm đất bùng lửa + vết cháy
    function breathFire(u) {
      var lane = u.lane, dir = u.dir;
      var mx = u.x + u.w * (dir > 0 ? 0.83 : 0.17);           // miệng rồng
      var my = u.alt + u.h * 0.32;
      var tx = Math.max(12, Math.min(lane._w - 12, mx + dir * rand(70, 105)));
      var dx = Math.abs(tx - mx), dy = my - 8;
      var len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI;
      if (lane._vis) {
        var f = spawn(lane, 'dragon-flame', mx, my);
        f.style.width = len.toFixed(0) + 'px';
        f.style.rotate = (dir > 0 ? ang : 180 - ang).toFixed(1) + 'deg';
        setTimeout(function () { f.remove(); }, 800);
      }
      setTimeout(function () {                                 // lửa chạm đất
        if (lane._vis) {
          spawn(lane, 'scorch', tx, 2);
          spawn(lane, 'fire-burst', tx, 8);
          for (var k = 0; k < 7; k++) {                        // lưỡi lửa bốc lên
            var e = spawn(lane, 'fire-ember', tx + rand(-16, 16), 4);
            e.style.setProperty('--ex', rand(-10, 10).toFixed(1) + 'px');
            e.style.setProperty('--ey', (-rand(20, 42)).toFixed(1) + 'px');
            e.style.animationDelay = (k * 0.05).toFixed(2) + 's';
          }
        }
        quake(lane, 'sm');
        knockNear(lane, tx, 55, u);
      }, 170);
    }
    // Bowler ném tảng đá: bay vòng cung → chạm đất → nảy lần 2 → lăn rồi mờ dần
    function arcMove(el, x0, y0, x1, y1, h, dur, r0, r1, done) {
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur);
        el.style.left = (x0 + (x1 - x0) * k).toFixed(1) + 'px';
        el.style.bottom = (y0 + (y1 - y0) * k + h * 4 * k * (1 - k)).toFixed(1) + 'px';
        el.style.rotate = (r0 + (r1 - r0) * k).toFixed(0) + 'deg';
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    }
    function boulderHit(u, lane, x) {
      if (lane._vis) {
        for (var k = 0; k < 4; k++) dust(u, x - 12 + rand(-10, 10), rand(-20, 20), true);
      }
      quake(lane, 'sm');
      knockNear(lane, x, 45, u);
    }
    function throwBoulder(u) {
      var lane = u.lane, dir = u.dir, W = lane._w;
      u.el.classList.add('is-thrown');                         // tảng đá rời tay
      var bw = u.w * 0.44;
      var sx = u.x + u.w * (dir > 0 ? 0.22 : 0.78), sy = u.h * 0.71;
      var clampX = function (x) { return Math.max(bw / 2, Math.min(W - bw / 2, x)); };
      var x1 = clampX(sx + dir * rand(80, 110)), x2 = clampX(x1 + dir * rand(55, 75)), x3 = clampX(x2 + dir * 26);
      var rock = document.createElement('img');
      rock.className = 'bw-boulder';
      rock.src = 'images/bowler-boulder.png';
      rock.alt = '';
      rock.style.width = bw.toFixed(1) + 'px';
      rock.style.marginLeft = (-bw / 2).toFixed(1) + 'px';
      lane.appendChild(rock);
      var r = dir * 300;
      arcMove(rock, sx, sy - bw * 0.45, x1, 0, 34, 460, 0, r, function () {
        boulderHit(u, lane, x1);
        arcMove(rock, x1, 0, x2, 0, 22, 360, r, r * 1.8, function () {          // nảy lần 2
          boulderHit(u, lane, x2);
          arcMove(rock, x2, 0, x3, 0, 0, 320, r * 1.8, r * 2.2, function () {   // lăn rồi mờ dần
            rock.style.opacity = '0';
            setTimeout(function () { rock.remove(); }, 320);
          });
        });
      });
      setTimeout(function () {                                 // cầm tảng đá mới
        u.el.classList.remove('is-thrown');
        var layer = u.el.querySelector('.bw-rock');
        if (layer) { layer.classList.remove('is-new'); void layer.offsetWidth; layer.classList.add('is-new'); }
      }, 900);
    }
    // Balloon thả bom: bom rơi nhanh dần, xoay tròn, chạm đất thì nổ
    function dropBomb(u) {
      var lane = u.lane;
      var sx = u.x + u.w * (u.dir * u.base > 0 ? 0.48 : 0.52);
      var sy = u.alt + u.h * 0.2;
      var drift = u.dir * u.speed * 0.35;                     // bom còn quán tính bay theo khinh khí cầu
      var bomb = spawn(lane, 'bl-bomb', sx, sy);
      var t0 = performance.now(), dur = Math.max(380, Math.sqrt(sy) * 60);
      (function fall(now) {
        var k = Math.min(1, (now - t0) / dur);
        var x = sx + drift * k * dur / 1000;
        var y = sy - (sy - 6) * k * k;
        bomb.style.left = x.toFixed(1) + 'px';
        bomb.style.bottom = y.toFixed(1) + 'px';
        bomb.style.rotate = (k * 220 * u.dir).toFixed(0) + 'deg';
        if (k < 1) { requestAnimationFrame(fall); return; }
        bomb.remove();
        if (lane._vis) {
          quake(lane, 'md');
          spawn(lane, 'wb-shock', x, 10);
          spawn(lane, 'wb-blast bl-blast', x, 12);
          for (var j = 0; j < 8; j++) {
            var a = Math.PI * (j / 7), r = rand(26, 50);
            var e = spawn(lane, 'fire-ember', x, 8);
            e.style.setProperty('--ex', (Math.cos(a) * r).toFixed(1) + 'px');
            e.style.setProperty('--ey', (-Math.sin(a) * r).toFixed(1) + 'px');
          }
          for (var m = 0; m < 3; m++) {
            var sm = spawn(lane, 'wb-smoke wb-smoke--big', x + rand(-14, 14), rand(4, 16));
            sm.style.setProperty('--dx', rand(-12, 12).toFixed(1) + 'px');
            sm.style.setProperty('--dy', (-rand(22, 40)).toFixed(1) + 'px');
          }
        }
        knockNear(lane, x, 70, u);
      })(t0);
    }
    // Minion nhổ cục dầu đen: rơi chéo xuống đất, có vệt tím, chạm đất thì bắn tung toé
    function spit(u) {
      var lane = u.lane, dir = u.dir;
      var sx = u.x + u.w * (dir > 0 ? 0.6 : 0.4);
      var sy = u.alt + u.h * 0.4;
      var ex = Math.max(10, Math.min(lane._w - 10, sx + dir * rand(60, 110)));
      var shot = spawn(lane, 'minion-shot', sx, sy);
      var t0 = performance.now(), dur = 420, trailAt = 0;
      (function fall(now) {
        var k = Math.min(1, (now - t0) / dur);
        var x = sx + (ex - sx) * k;
        var y = sy + (4 - sy) * k * k;                               // rơi nhanh dần
        shot.style.left = x.toFixed(1) + 'px';
        shot.style.bottom = y.toFixed(1) + 'px';
        if (lane._vis && now >= trailAt) { spawn(lane, 'minion-trail', x, y); trailAt = now + 40; }
        if (k < 1) { requestAnimationFrame(fall); return; }
        shot.remove();
        spawn(lane, 'minion-splat', x, 2);
        for (var j = 0; j < 6; j++) {
          var a = Math.PI * (0.1 + 0.8 * j / 5), r = rand(14, 30);
          var d = spawn(lane, 'minion-drop', x, 4);
          d.style.setProperty('--ex', (Math.cos(a) * r).toFixed(1) + 'px');
          d.style.setProperty('--ey', (-Math.sin(a) * r).toFixed(1) + 'px');
        }
        knockNear(lane, x, 40, u);
      })(t0);
    }

    /* ----- Wall Breaker: nổ tung, lát sau con mới chạy vào ----- */
    function wbFuse(u) {                                       // vị trí ngòi bom (ảnh gốc nhìn sang trái)
      return { x: u.x + u.w * (u.dir < 0 ? 0.64 : 0.36), y: u.h * 0.98 };
    }
    function explodeWB(u) {
      if (u.mode === 'gone') return;
      var lane = u.lane, cx = u.x + u.w / 2, now = performance.now();
      setMode(u, 'gone', now);                                 // biến mất theo vụ nổ
      clearTimeout(u.timer);
      u.bubble.classList.remove('is-shown');
      if (lane._vis) {
        quake(lane, 'lg');
        spawn(lane, 'wb-shock', cx, 16);
        spawn(lane, 'wb-blast', cx, 18);
        for (var k = 0; k < 12; k++) {                         // tàn lửa văng tứ phía (nửa trên)
          var a = Math.PI * (k / 11), r = rand(40, 75);
          var e = spawn(lane, 'fire-ember', cx, 12);
          e.style.setProperty('--ex', (Math.cos(a) * r).toFixed(1) + 'px');
          e.style.setProperty('--ey', (-Math.sin(a) * r).toFixed(1) + 'px');
        }
        for (var j = 0; j < 6; j++) {                          // khói bốc lên
          var sm = spawn(lane, 'wb-smoke wb-smoke--big', cx + rand(-26, 26), rand(4, 26));
          sm.style.setProperty('--dx', rand(-18, 18).toFixed(1) + 'px');
          sm.style.setProperty('--dy', (-rand(26, 50)).toFixed(1) + 'px');
          sm.style.animationDelay = (j * 0.05).toFixed(2) + 's';
        }
      }
      knockNear(lane, cx, 110, u);                             // hất tung xung quanh, Bộ xương rã, Wall Breaker khác nổ theo
    }
    function respawnWB(u, now) {                               // con mới chạy vào từ mép đường chạy
      var side = Math.random() < 0.5 ? -1 : 1;
      u.x = side < 0 ? -u.w * 0.9 : u.lane._w - u.w * 0.1;
      u.dir = -side;
      face(u);
      u.roam = true;                                           // cho phép chạy từ ngoài mép vào (không bị kéo giật vào trong)
      setMode(u, 'run', now);
      if (u.lane._vis && Math.random() < 0.5) say(u, pick(u.k.cries));
    }

    /* ----- Phù thủy gọi Bộ xương ----- */
    function summon(wt) {
      wt.skeletons = wt.skeletons.filter(function (s) { return !s.dead; });
      var lane = wt.lane, now = performance.now();
      var free = SKELETON_MAX - wt.skeletons.length;
      var sides = [-1, 1];
      for (var k = 0; k < free; k++) {
        var cx = wt.x + wt.w / 2 + sides[k % 2] * rand(42, 72);
        cx = Math.max(24, Math.min(lane._w - 24, cx));
        if (lane._vis) {
          spawn(lane, 'summon-ring', cx, 0);
          for (var j = 0; j < 6; j++) {                       // khói tím bốc lên
            var wsp = spawn(lane, 'summon-wisp', cx + rand(-18, 18), 2);
            wsp.style.setProperty('--ex', rand(-10, 10).toFixed(1) + 'px');
            wsp.style.setProperty('--ey', (-rand(26, 46)).toFixed(1) + 'px');
          }
        }
        createSkeleton(wt, cx, now + k * 120);
      }
    }
    function createSkeleton(wt, cx, now) {
      var el = document.createElement('span');
      el.className = 'barb barb--skeleton';
      el.innerHTML = '<span class="barb-body"><span class="barb-sprite"><img src="images/skeleton.png" alt="" width="200" height="175" decoding="async"></span><span class="barb-slash"></span></span><span class="barb-bubble"></span>';
      wt.lane.appendChild(el);
      var s = { el: el, bubble: el.querySelector('.barb-bubble'), kind: 'skeleton', k: KIND.skeleton,
                lane: wt.lane, dir: wt.dir, base: -1,                       // ảnh gốc nhìn sang trái
                x: 0, w: el.offsetWidth, h: el.offsetHeight, speed: 0, mode: '', until: 0, dustAt: 0, timer: 0,
                roam: false, boost: 0, alt: 0, modeAt: 0, phase: 0, skeletons: [],
                owner: wt, expire: now + 650 + SKELETON_LIFE };
      s.x = cx - s.w / 2;
      face(s);
      setMode(s, 'rise', now);
      place(s, now, 0);
      el.addEventListener('click', function () { collapse(s); });   // bấm vào: rã luôn
      units.push(s);
      wt.skeletons.push(s);
    }
    // Rã rời: cắt ảnh bộ xương thành lưới 3×3 mảnh, mỗi mảnh rơi xuống đất, xoay, nảy rồi mờ dần
    function collapse(s) {
      if (s.dead) return;
      s.dead = true;
      var lane = s.lane;
      if (lane._vis) {
        var w = s.w, h = s.el.querySelector('img').offsetHeight || s.h;
        var heap = document.createElement('div');
        heap.className = 'bone-heap';
        heap.style.left = s.x.toFixed(1) + 'px';
        heap.style.width = w + 'px';
        heap.style.height = h + 'px';
        heap.style.scale = (s.dir * s.base) + ' 1';
        var cols = 3, rows = 3, pw = w / cols, ph = h / rows;
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var p = document.createElement('span');
          p.className = 'bone-piece';
          p.style.left = (c * pw).toFixed(1) + 'px';
          p.style.top = (r * ph).toFixed(1) + 'px';
          p.style.width = pw.toFixed(1) + 'px';
          p.style.height = ph.toFixed(1) + 'px';
          p.style.backgroundSize = w + 'px ' + h + 'px';
          p.style.backgroundPosition = (-c * pw).toFixed(1) + 'px ' + (-r * ph).toFixed(1) + 'px';
          p.style.setProperty('--fall', (h - (r + 1) * ph + rand(-2, 3)).toFixed(1) + 'px');
          p.style.setProperty('--dx', rand(-16, 16).toFixed(1) + 'px');
          p.style.setProperty('--rot', rand(-140, 140).toFixed(0) + 'deg');
          p.style.animationDelay = (r === 0 ? 0.08 : 0) + 's, 1.5s';   // đầu lâu rơi sau một chút
          heap.appendChild(p);
        }
        lane.appendChild(heap);
        setTimeout(function () { heap.remove(); }, 2200);
        dust(s, s.x + w / 2 - 7, 0);
      }
      clearTimeout(s.timer);
      s.el.remove();
    }

    // Wizard bắn quả cầu lửa: bay vòng cung, có đuôi lửa + tàn lửa, chạm đất thì nổ
    function castFireball(u) {
      var lane = u.lane, dir = u.dir, W = lane._w;
      var sx = u.x + u.w * (dir < 0 ? 0.32 : 0.68);
      var sy = u.h * 0.67 + 8;
      var dist = rand(220, 320) * (mobile() ? 0.6 : 1);
      var ex = Math.max(16, Math.min(W - 16, sx + dir * dist));
      var ball = spawn(lane, 'fireball' + (dir < 0 ? ' to-left' : ''), sx, sy);
      var t0 = performance.now(), dur = 650, sparkAt = 0;
      (function fly(now) {
        var k = Math.min(1, (now - t0) / dur);
        var x = sx + (ex - sx) * k;
        var y = sy + (10 - sy) * k * k + Math.sin(k * Math.PI) * 16;
        ball.style.left = x.toFixed(1) + 'px';
        ball.style.bottom = y.toFixed(1) + 'px';
        if (lane._vis && now >= sparkAt) { spawn(lane, 'fire-spark', x - dir * 8, y + rand(-4, 4)); sparkAt = now + 35; }
        if (k < 1) requestAnimationFrame(fly);
        else { ball.remove(); explode(lane, x, u); }
      })(t0);
    }
    // ----- Druid: tia hồi máu từ quả cầu trên gậy tới đồng đội gần nhất; bấm vào Druid thì hồi máu cả vùng -----
    function healFx(t) {
      var lane = t.lane;
      if (!lane._vis) return;
      var cx = t.x + t.w / 2, base = t.alt || 0;
      spawn(lane, 'heal-ring', cx, base);
      for (var k = 0; k < 5; k++) {
        var p = spawn(lane, 'heal-plus', cx + rand(-t.w * 0.35, t.w * 0.35), base + t.h * rand(0.25, 0.7));
        p.style.animationDelay = (k * 0.08).toFixed(2) + 's';
      }
      t.el.classList.remove('is-healed');
      void t.el.offsetWidth;
      t.el.classList.add('is-healed');                       // sáng viền xanh lá một lúc
      clearTimeout(t.healTimer);
      t.healTimer = setTimeout(function () { t.el.classList.remove('is-healed'); }, 1100);
    }
    function druidHeal(u) {
      var lane = u.lane, dir = u.dir;
      var ox = u.x + u.w * (dir > 0 ? 0.15 : 0.85), oy = u.h * 0.8;   // vị trí quả cầu trên gậy
      var alive = function (o) { return o.lane === lane && !o.dead && o.mode !== 'gone' && o.w; };
      if (u.areaHeal) {                                      // bấm vào Druid: hồi máu mọi quân quanh mình
        u.areaHeal = false;
        if (lane._vis) spawn(lane, 'heal-aura', u.x + u.w / 2, 0);
        units.forEach(function (o) {
          if (alive(o) && Math.abs((o.x + o.w / 2) - (u.x + u.w / 2)) < 240) healFx(o);
        });
        return;
      }
      var best = null, bestD = 1e9;
      units.forEach(function (o) {
        if (o === u || !alive(o)) return;
        var d = Math.abs((o.x + o.w / 2) - ox);
        if (d < bestD) { bestD = d; best = o; }
      });
      var t = best && bestD < 420 ? best : u;                // không có ai ở gần thì tự hồi cho mình
      if (lane._vis && t !== u) {
        var tx = t.x + t.w / 2, ty = (t.alt || 0) + t.h * 0.5;
        var dx = tx - ox, dy = ty - oy;
        var beam = spawn(lane, 'heal-beam', ox, oy);
        beam.style.width = Math.sqrt(dx * dx + dy * dy).toFixed(0) + 'px';
        beam.style.rotate = (Math.atan2(-dy, dx) * 180 / Math.PI).toFixed(1) + 'deg';
      }
      setTimeout(function () { healFx(t); }, t === u ? 0 : 180);
    }
    function explode(lane, x, caster) {
      spawn(lane, 'fire-burst', x, 10);
      quake(lane, 'sm');
      for (var k = 0; k < 8; k++) {
        var a = Math.PI * (k / 7), r = rand(26, 46);
        var e = spawn(lane, 'fire-ember', x, 10);
        e.style.setProperty('--ex', (Math.cos(a) * r).toFixed(1) + 'px');
        e.style.setProperty('--ey', (-Math.sin(a) * r).toFixed(1) + 'px');
      }
      knockNear(lane, x, 60, caster);
    }

    function tick(now) {
      if (!running) return;
      if (units.some(function (u) { return u.dead; })) units = units.filter(function (u) { return !u.dead; });
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      units.forEach(function (u) {
        if (!u.w || u.dead) return;
        if (u.kind === 'skeleton') {                           // hết giờ: run lạch cạch rồi rã rời
          if (now >= u.expire) { collapse(u); return; }
          if (now >= u.expire - 700) u.el.classList.add('is-rattle');
        }
        if (u.leader) { follow(u, now, dt); place(u, now, dt); return; }
        var W = u.lane._w;
        var sneak = u.kind === 'goblin' && u.mode === 'idle';          // Goblin rón rén vẫn nhích dần
        var moving = u.mode === 'run' || sneak || (u.kind === 'hog' && u.mode === 'jump');
        if (moving) {
          u.x += u.dir * u.speed * (now < u.boost ? 1.8 : 1) * (sneak ? 0.22 : 1) * dt;
          var min = -u.w * 0.1, max = W - u.w * 0.9;
          if (u.roam) {
            if ((u.x < -u.w - 4 || u.x > W + 4) && !travel(u)) u.x = Math.max(min, Math.min(max, u.x));
          } else if (u.x < min) { u.x = min; u.dir = 1; face(u); }
          else if (u.x > max) { u.x = max; u.dir = -1; face(u); }
          if (u.k.dust && u.mode === 'run' && now >= u.dustAt) { dust(u); u.dustAt = now + u.k.dust; }
          if (u.kind === 'goblin' && u.mode === 'run' && now >= (u.coinAt || 0)) { coinFromBag(u); u.coinAt = now + rand(500, 1300); }
        }
        // Ngòi bom Wall Breaker nhả khói (dày hơn khi sắp nổ)
        if (u.kind === 'wb' && u.lane._vis && (u.mode === 'run' || u.mode === 'attack' || u.mode === 'idle') && now >= (u.smokeAt || 0)) {
          var fz = wbFuse(u), sm = spawn(u.lane, 'wb-smoke', fz.x, fz.y + rand(-2, 4));
          sm.style.setProperty('--dx', (u.mode === 'run' ? -u.dir * 16 : rand(-6, 6)).toFixed(1) + 'px');
          u.smokeAt = now + (u.mode === 'attack' ? 60 : 150);
        }
        if (now >= u.until) nextMode(u, now);
        place(u, now, dt);
      });
      requestAnimationFrame(tick);
    }
    var last = 0;
    function anyVisible() { return lanes.some(function (l) { return l._vis; }); }
    function start() {
      if (running || document.hidden || !anyVisible()) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }

    measure();
    var t0 = performance.now();
    units.forEach(function (u, i) {
      // data-lane="id-mục": nhân vật bắt đầu ở mục đó thay vì ở đầu trang
      var home = u.el.getAttribute('data-lane') && laneById(u.el.getAttribute('data-lane'));
      if (home) { home.appendChild(u.el); u.lane = home; u.x = rand(0.1, 0.8) * home._w; }
      else u.x = (parseFloat(u.el.style.getPropertyValue('--x')) || 10) / 100 * heroLane._w;
      if (FLY[u.kind]) u.alt = FLY[u.kind].base[0]; place(u, t0, 0);
      face(u);
      setMode(u, i === 1 ? 'idle' : 'run', t0);
      u.el.addEventListener('click', function () {
        var now = performance.now();
        if (u.mode === 'jump') return;
        if (u.kind === 'goblin') { startle(u); return; }
        if (u.kind === 'dragon' || u.kind === 'bowler') {  // phun lửa / ném đá ngay
          if (u.mode === 'attack') return;
          setMode(u, 'attack', now);
          say(u, pick(u.k.cries));
          return;
        }
        if (u.kind === 'balloon') {                        // thả bom ngay
          if (u.mode === 'attack') return;
          setMode(u, 'attack', now);
          say(u, pick(u.k.cries));
          return;
        }
        if (u.kind === 'wb') {                             // châm ngòi ngay: đếm ngược rồi nổ
          if (u.mode === 'attack' || u.mode === 'gone') return;
          setMode(u, 'attack', now);
          return;
        }
        if (u.kind === 'witch') {                          // gọi Bộ xương ngay
          if (u.mode === 'attack') return;
          setMode(u, 'attack', now);
          say(u, pick(u.k.cries));
          return;
        }
        if (u.kind === 'minion') {                         // lộn một vòng rồi nhổ dầu
          setMode(u, 'jump', now);
          setTimeout(function () { spit(u); }, 420);
          say(u, pick(u.k.cries));
          return;
        }
        if (u.kind === 'druid') {                          // hồi máu cả vùng ngay
          if (u.mode === 'attack') return;
          u.areaHeal = true;
          setMode(u, 'attack', now);
          say(u, 'Hồi phục toàn đội!');
          return;
        }
        if (u.kind === 'wizard' || u.kind === 'pekka') {   // Wizard bắn cầu lửa / P.E.K.K.A chém ngay
          if (u.mode === 'attack') return;
          setMode(u, 'attack', now);
        } else if (u.kind === 'miner') {
          if (u.mode === 'run') setMode(u, 'idle', now);   // đang dưới đất → ló lên
          else {                                           // đang ở trên → chui xuống, đào sang mục khác
            var mi = lanes.indexOf(u.lane);
            if (!lanes[mi + (u.dir > 0 ? 1 : -1)]) { u.dir *= -1; face(u); }
            u.roam = true; u.boost = now + 2500;
            setMode(u, 'run', now);
          }
        } else {
          setMode(u, 'jump', now);
          if (u.kind === 'giant') setTimeout(function () { slam(u); }, 660);   // lúc chạm đất
          if (u.kind === 'hog') {                                             // phóng sang mục khác
            var idx = lanes.indexOf(u.lane);
            if (!lanes[idx + (u.dir > 0 ? 1 : -1)]) { u.dir *= -1; face(u); }   // hết đường thì quay đầu
            u.boost = now + 2600; u.roam = true;
          }
        }
        say(u, pick(u.k.cries));
      });
    });
    // Xếp các Goblin theo sau đứng thành hàng phía sau trưởng bầy
    goblins.forEach(function (g) {
      if (!g.leader) return;
      var L = g.leader;
      if (g.lane !== L.lane) L.lane.appendChild(g.el);
      g.lane = L.lane;
      g.dir = L.dir; face(g);
      g.x = L.x - L.dir * g.w * 0.75 * g.slot;
      g.el.style.translate = g.x.toFixed(1) + 'px 0';
    });
    heroLane.classList.add('is-live');
    measure();

    // Chỉ chạy khi có ít nhất 1 đường chạy đang hiện trên màn hình (đỡ tốn CPU)
    if (hasIO) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target._vis = e.isIntersecting; });
        if (anyVisible()) start(); else running = false;
      });
      lanes.forEach(function (l) { io.observe(l); });
    } else {
      lanes.forEach(function (l) { l._vis = true; });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false; else start();
    });
    window.addEventListener('resize', measure);
    start();
  })();
})();
