window.addEventListener('load', init);

function init(){
  window.captchas = [];
  let captchas = document.querySelectorAll('.heardcha');
  for(let c=0; c<captchas.length; c++){
    let container = captchas[c];
    let captcha = new Heardcha(container);
    window.captchas.push(captcha);
  }
  set_style();
}

class Heardcha{
  constructor(element){
    this.container = element;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext();
    this.items = [];
    this.form = this.generate_ui();
    this.container.appendChild(this.form);
    this.requestChallenge();
  }

  generate_ui(){
    let captcha = this;
    let form = document.createElement('form');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      captcha.attempt();
    });
    let invis_submit = document.createElement('input');
    invis_submit.type = 'submit';
    invis_submit.style.display = 'none';
    form.appendChild(invis_submit);
    let container = document.createElement('div');
    form.appendChild(container);
    container.classList.add('captcha-grid');
    container.classList.add('captcha-container');
    let main = document.createElement('div');
    main.classList.add('captcha-main');
    main.classList.add('captcha-col2');
    container.appendChild(main);

    // Right Pane
    let right = document.createElement('div');
    right.classList.add('captcha-right');
    right.classList.add('captcha-col2');
    let upper_right = document.createElement('div');
    let lower_right = document.createElement('div');
    upper_right.classList.add('captcha-grid');
    right.appendChild(upper_right);
    right.appendChild(lower_right);
    container.appendChild(right);

    // Options
    let options = document.createElement('div');
    options.classList.add('captcha-col2');
    options.classList.add('captcha-options');
    let refresh = document.createElement('button');
    refresh.innerHTML = '<i class="material-icons">refresh</i>';
    refresh.title = 'Get a new challenge';
    refresh.addEventListener('click', function(e){
      e.preventDefault();
      captcha.requestChallenge(function(){
        captcha.items[0].content.click();
      });
    });
    options.appendChild(refresh);
    let info = document.createElement('button');
    info.innerHTML = '<i class="material-icons">info_outline</i>';
    info.title = 'Help';
    info.addEventListener('click', function(e){
      e.preventDefault();
    });
    options.appendChild(info);
    upper_right.appendChild(options);
    // Logo
    let logo = document.createElement('div');
    logo.classList.add('captcha-col2');
    logo.classList.add('captcha-logo');
    logo.innerHTML = 'HeardCha';
    upper_right.appendChild(logo);

    let cg_link = document.createElement('a');
    cg_link.href = 'http://citygram.smusic.nyu.edu/';
    cg_link.target = '_blank';
    let cg_logo = document.createElement('img');
    cg_logo.src = '/client/img/logo.png';
    cg_link.appendChild(cg_logo);
    cg_logo.classList.add('captcha-cg-logo');
    lower_right.appendChild(cg_link);

    let submit = document.createElement('input');
    submit.type = 'submit';
    form.appendChild(submit);

    // Overlay
    let overlay = document.createElement('div');
    overlay.classList.add('captcha-overlay');
    overlay.innerHTML = 'Are you Human?';
    this.overlay = overlay;
    overlay.addEventListener('click', function(e){
      captcha.items[0].content.click();
      this.style.display = 'none';
    });
    main.appendChild(overlay);

    this.main = main;

//    this.container.addEventListener('keydown', function(e){
//      console.log(e);
//      if(e.keyCode == 32){
//        let wasPlaying = false;
//        captcha.items.forEach(function(item){
//          if(!item.audio.paused){
//            item.button.click();
//            wasPlaying = true;
//          }
//        });
//        if(!wasPlaying){
//          captcha.items[0].button.click();
//        }
//      }
//    });
    return form;
  }

  item_ui(i){
    let captcha = this;

    let content = document.createElement('div');
    content.classList.add('captcha-border');

    let source = this.context.createBufferSource(1);
    source.connect(this.context.destination);
    let play_button = document.createElement('span');
    play_button.innerHTML = '\u25B6';
    play_button.title = 'Play';
    play_button.classList.add('captcha-play-button');

    let answer = document.createElement('input');
    answer.type = 'text';
    answer.name = 'answer'+i;
    answer.required = true;
    let nth = ['First', 'Second', 'Third', 'Fourth'];
    answer.placeholder = nth[i] + ' sound';
    answer.classList.add('captcha-textbox');

    let scriptNode = captcha.context.createScriptProcessor(1024, 1, 1);
    let item = {
      content: content,
      source: source,
      scriptNode: scriptNode,
      button: play_button,
      answer: answer,
      playing: false
    }

    let canvas = document.createElement('canvas');
    canvas.classList.add('captcha-canvas');
    let canvas_ctx= canvas.getContext("2d");
    content.appendChild(canvas);
    content.appendChild(play_button);

    let gradient = canvas_ctx.createLinearGradient(0,0,0,canvas.height);
    gradient.addColorStop(1,'#00ff00');
    gradient.addColorStop(0.75,'#ffff00');
    gradient.addColorStop(0.25,'#ff0000');
    gradient.addColorStop(0,'#8b0000');
    scriptNode.onaudioprocess = function(e){
      if(!item.playing){
        canvas_ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas_ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        canvas_ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      let rms = 0;
      for (var channel = 0; channel < e.inputBuffer.numberOfChannels; channel++) {
        let input = e.inputBuffer.getChannelData(channel);
        let sum = 0;
        for (let sample = 0; sample < e.inputBuffer.length; sample++) {
          sum += Math.pow(input[sample], 2);
        }
        rms += Math.sqrt(sum / input.length)
      }
      rms = rms / e.inputBuffer.numberOfChannels;
      // clear the current state
      canvas_ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Progress bar
      if(item.source.start_time){
        let percent = (captcha.context.currentTime - item.source.start_time) / item.source.buffer.duration;
        canvas_ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        canvas_ctx.fillRect(0, 0, canvas.width*percent, canvas.height);
      }
      // create the meter
      canvas_ctx.fillStyle = gradient;
      canvas_ctx.fillRect(canvas.width*0.25, canvas.height, canvas.width*0.5, -rms*1000);
    }
    scriptNode.connect(captcha.context.destination);


    content.addEventListener('click', function(e){
      e.preventDefault();
      let button = this.querySelector('.captcha-play-button');
      if(item.playing){
        item.playing = false;
        item.source.stop();
        captcha.init_source(item, item.source.buffer);
        button.innerHTML = '\u25B6';
        button.title = 'Play';
      }else{
        item.playing = true;
        for(let i=0; i<captcha.items.length; i++){
          let other = captcha.items[i];
          if(other != item && other.playing){
            other.source.stop();
            other.playing = false;
            captcha.init_source(other, other.source.buffer);
            other.button.innerHTML = '\u25B6';
            other.button.title = 'Play';
          }
        }
        item.source.start();
        item.source.start_time = captcha.context.currentTime;
        button.innerHTML = '\u25FC';
        button.title = 'Stop Audio';
      }
      item.answer.focus();
    });

    return item;
  }


  attempt(){
    console.log('attempting');
    let captcha = this;
    let xhr = new XMLHttpRequest();
    xhr.onload = function(e){
      let response = xhr.response;
      console.log(response);

      if(response.success){
        let checkmark = captcha.main.querySelector('.captcha-feedback-animation');
        checkmark.classList.remove('captcha-loader');
        checkmark.classList.remove('captcha-wrong');
        checkmark.classList.add('captcha-checkmark');
        let text = captcha.main.querySelector('.captcha-feedback-text');
        text.innerHTML = 'You are Human!';
      }else{
        let checkmark = captcha.main.querySelector('.captcha-feedback-animation');
        checkmark.classList.remove('captcha-loader');
        checkmark.classList.remove('captcha-checkmark');
        checkmark.classList.add('captcha-wrong');
        let text = captcha.main.querySelector('.captcha-feedback-text');
        text.innerHTML = 'Try again.';
        setTimeout(function(){
          captcha.requestChallenge();
        }, 500);
      }
    }
    let formdata = new FormData(this.form);
    formdata.append('token', captcha.token);
    let data = {};
    for(let pair of formdata){
      data[pair[0]] = pair[1];
    }
    data = JSON.stringify(data);
    console.log(data);
    let url = '/captcha/attempt';
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.responseType = 'json';
    xhr.send(data);

    // Visual Feedback
    let height = captcha.main.clientHeight;
    captcha.main.innerHTML = '';
    let feedback = document.createElement('div');
    feedback.classList.add('captcha-wrapper');
    feedback.classList.add('captcha-feedback-wrapper');
    feedback.classList.add('captcha-grid');
    feedback.style.height = height - 6.4;
    let checkmark = document.createElement('div');
    checkmark.classList.add('captcha-feedback-animation');
    checkmark.classList.add('captcha-col2');
    checkmark.classList.add('captcha-loader');
    feedback.appendChild(checkmark);
    let text = document.createElement('div');
    text.classList.add('captcha-col2');
    text.classList.add('captcha-feedback-text');
    text.innerHTML = 'Are you Human?';
    feedback.appendChild(text);
    captcha.main.appendChild(feedback);
  }

  requestChallenge(callback){
    let captcha = this;

    let xhr = new XMLHttpRequest();
    xhr.onload = function(e){
      let response = xhr.response;
      console.log(response);
      for(let i=0; i<captcha.items.length; i++){
        let item = captcha.items[i];
        if(item.playing){
          item.source.stop();
        }
      }

      captcha.token = response.token;

      if(captcha.items.length > 0){
        captcha.main.innerHTML = '';
        for(let i=0; i<captcha.items.length; i++){
          let item = captcha.items[i];
          item.source.disconnect();
          item.answer.value = '';
          item.playing = false;
        }
      }
      let upper = document.createElement('div');
      let lower = document.createElement('div');
      upper.classList.add('captcha-grid');
      upper.classList.add('captcha-wrapper');
      lower.classList.add('captcha-wrapper');
      captcha.main.appendChild(upper);
      captcha.main.appendChild(lower);

      let instructions = document.createElement('span');
      instructions.innerHTML = 'Type what you hear:';
      lower.appendChild(instructions);

      let answers = document.createElement('div');
      answers.classList.add('captcha-grid');
      lower.appendChild(answers);

      let semaphore = response.streams.length;
      for(let i=0; i<response.streams.length; i++){
        let item = captcha.items[i];
        if(item == null){
          item = captcha.item_ui(i);
          captcha.items.push(item);
        }
        let wrapper = document.createElement('div');
        wrapper.classList.add('captcha-col'+response.streams.length);
        wrapper.appendChild(item.content);
        upper.appendChild(wrapper);
        item.answer.classList.add('captcha-col'+response.streams.length);
        answers.appendChild(item.answer);

        let data = _base64ToArrayBuffer(response.streams[i]);
        captcha.context.decodeAudioData(data, function(buffer){
          captcha.init_source(item, buffer, function(item){
            let index = captcha.items.indexOf(item);
            let next = captcha.items[index+1];
            if(next != null){
              next.button.click();
            }
          });
          semaphore -= 1;
          if(semaphore <= 0){
            if(callback) callback();
          }
        },function(e){
          console.log(e);
        });
      }
      //let suggestions = document.createElement('div');
      //suggestions.innerHTML = 'Eg. ' + response.suggestions;
      //captcha.main.appendChild(suggestions);

    }
    let url = '/captcha/generate';
    xhr.open('GET', url);
    xhr.responseType = 'json';
    xhr.send();
  }

  init_source(item, buffer, callback){
    let captcha = this;
    item.source.disconnect();
    item.source = captcha.context.createBufferSource(1);
    item.source.connect(captcha.context.destination);
    item.source.connect(item.scriptNode);
    item.source.buffer = buffer;
    item.source.onended = function(){
      item.playing = false;
      item.button.innerHTML = '\u25B6';
      captcha.init_source(item, item.source.buffer);
      if (callback) callback(item);
    }
  }
}

function set_style(){
  let body = `
    .heardcha{
      font-family: 'Roboto', sans-serif;
    }
    .heardcha.material-icons{
      font-size: 18px;
    }
    .captcha-container{
      background-color: #7c0000;
      border-radius: 5px;
    }
    .captcha-col2{
      float: left;
      width: 50%;
      box-sizing: border-box;
      margin: 0.2em;
      position: relative;
    }
    .captcha-main{
      width: 80%;
    }
    .captcha-right{
      width: 20%;
    }
    .captcha-options{
      width: 30%;
    }
    .captcha-options button{
      width: 100%;
      padding: 0;
    }
    .captcha-logo{
      width: 70%;
      color: #FFFFFF;
      font-weight: bold;
    }
    .captcha-cg-logo{
      width: 100%;
      position:absolute;
      bottom: 0;
      right: 0;
    }
    .captcha-play-button{
      position: absolute;
      bottom: 0;
      right: 0;
      padding: 0.2em;
    }
    .captcha-canvas{
      width: 100%;
      margin: 0 auto;
      display: block;
    }
    .captcha-grid{
      display: flex;
      clear: both;
    }
    .captcha-textbox{
      width: 100%;
      border: 1.5px solid;
      padding: 0.2em;
    }
    .captcha-wrapper{
      padding: 0.2em;
      margin: 0.2em;
      border-radius: 5px;
      background-color: #FFFFFF;
    }
    .captcha-border{
      border: 1px solid #dfdfdf;
    }
    .captcha-overlay{
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.8);
      z-index: 999;
      font-size: 3em;
      color: #000000;
      text-align: center;
      text-shadow: -1px 0 white, 0 1px white, 1px 0 white, 0 -1px white;
      cursor: pointer;
    }
    .captcha-overlay:before {
      content: '';
      font-size: medium;
      position: absolute;
      width: 9em;
      height: 9em;
      border-radius: 50%;
      border: 0.6em solid #ffffff;
      transition: all 0.3s;
      -webkit-transition: all 0.3s;
      -moz-transition: all 0.3s;
      margin: auto;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
    }
    .captcha-overlay:after {
      content: '';
      transition: opacity 0.6s;
      -webkit-transition: opacity 0.6s;
      -moz-transition: opacity 0.6s;
      border-top: 50px solid transparent;
      border-bottom: 50px solid transparent;
      border-left: 60px solid #ffffff;
      position: absolute;
      left: 12px;
      right: 0;
      top: 0;
      bottom: 0;
      margin: auto;
      width: 0;
      height: 0;
    }
    .captcha-overlay:hover:before, .captcha-overlay:focus:before {
      transform: scale(1.1);
      -webkit-transform: scale(1.1);
      -moz-transform: scale(1.1);
    }
    .captcha-feedback-text {
      font-size: 2em;
      margin: auto;
    }
    .captcha-feedback-animation{
      width: 30%;
    }
    .captcha-feedback-wrapper{
      display: flex;
      padding: 0;
      width: 100%;
      position: relative;
      align-items: center;
    }
    .captcha-checkmark:after {
      -webkit-animation-delay: 100ms;
      -moz-animation-delay: 100ms;
      animation-delay: 100ms;
      -webkit-animation-duration: 1s;
      -moz-animation-duration: 1s;
      animation-duration: 1s;
      -webkit-animation-timing-function: ease;
      -moz-animation-timing-function: ease;
      animation-timing-function: ease;
      -webkit-animation-name: checkmark;
      -moz-animation-name: checkmark;
      animation-name: checkmark;
      -webkit-transform: scaleX(-1) rotate(135deg);
      -moz-transform: scaleX(-1) rotate(135deg);
      -ms-transform: scaleX(-1) rotate(135deg);
      -o-transform: scaleX(-1) rotate(135deg);
      transform: scaleX(-1) rotate(135deg);
      -webkit-animation-fill-mode: forwards;
      -moz-animation-fill-mode: forwards;
      animation-fill-mode: forwards;
    }
    .captcha-checkmark:after {
      opacity: 0;
      height: 75px;
      width: 37.5px;
      -webkit-transform-origin: left top;
      -moz-transform-origin: left top;
      -ms-transform-origin: left top;
      -o-transform-origin: left top;
      transform-origin: left top;
      border-right: 15px solid #2EB150;
      border-top: 15px solid #2EB150;
      border-radius: 2.5px !important;
      content: '';
      left: 25px;
      position: absolute;
    }

    @-webkit-keyframes checkmark {
      0% {
        height: 0;
        width: 0;
        opacity: 0;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
    @-moz-keyframes checkmark {
      0% {
        height: 0;
        width: 0;
        opacity: 1;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
    @keyframes checkmark {
      0% {
        height: 0;
        width: 0;
        opacity: 1;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
    .captcha-loader {
      font-size: 10px;
      margin: 50px auto;
      text-indent: -9999em;
      width: 11em;
      height: 11em;
      border-radius: 50%;
      background: #03a9f4;
      background: -moz-linear-gradient(left, #03a9f4 10%, rgba(255, 255, 255, 0) 42%);
      background: -webkit-linear-gradient(left, #03a9f4 10%, rgba(255, 255, 255, 0) 42%);
      background: -o-linear-gradient(left, #03a9f4 10%, rgba(255, 255, 255, 0) 42%);
      background: -ms-linear-gradient(left, #03a9f4 10%, rgba(255, 255, 255, 0) 42%);
      background: linear-gradient(to right, #03a9f4 10%, rgba(255, 255, 255, 0) 42%);
      position: relative;
      -webkit-animation: load3 1.4s infinite linear;
      animation: load3 1.4s infinite linear;
      -webkit-transform: translateZ(0);
      -ms-transform: translateZ(0);
      transform: translateZ(0);
    }
    .captcha-loader:before {
      width: 50%;
      height: 50%;
      background: #03a9f4;
      border-radius: 100% 0 0 0;
      position: absolute;
      top: 0;
      left: 0;
      content: '';
    }
    .captcha-loader:after {
      background: #ffffff;
      width: 75%;
      height: 75%;
      border-radius: 50%;
      content: '';
      margin: auto;
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
    }
    @-webkit-keyframes load3 {
      0% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
      }
      100% {
        -webkit-transform: rotate(360deg);
        transform: rotate(360deg);
      }
    }
    @keyframes load3 {
      0% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
      }
      100% {
        -webkit-transform: rotate(360deg);
        transform: rotate(360deg);
      }
    }
    .captcha-wrong:before {
      -webkit-transform: scaleX(-1) rotate(45deg);
      -moz-transform: scaleX(-1) rotate(45deg);
      -ms-transform: scaleX(-1) rotate(45deg);
      -o-transform: scaleX(-1) rotate(45deg);
      transform: scaleX(-1) rotate(45deg);
    }
    .captcha-wrong:before {
      opacity: 1;
      height: 75px;
      width: 37.5px;
      -webkit-transform-origin: right bottom;
      -moz-transform-origin: right bottom;
      -ms-transform-origin: right bottom;
      -o-transform-origin: right bottom;
      transform-origin: right bottom;
      border-left: 15px solid #7c0000;
      border-radius: 2.5px !important;
      content: '';
      left: 25px;
      top: -10px;
      position: absolute;
    }
    .captcha-wrong:after {
      -webkit-animation-duration: 0.5s;
      -moz-animation-duration: 0.5s;
      animation-duration: 0.5s;
      -webkit-animation-timing-function: ease;
      -moz-animation-timing-function: ease;
      animation-timing-function: ease;
      -webkit-animation-name: wrong;
      -moz-animation-name: wrong;
      animation-name: wrong;
      -webkit-transform: scaleX(-1) rotate(135deg);
      -moz-transform: scaleX(-1) rotate(135deg);
      -ms-transform: scaleX(-1) rotate(135deg);
      -o-transform: scaleX(-1) rotate(135deg);
      transform: scaleX(-1) rotate(135deg);
      -webkit-animation-fill-mode: forwards;
      -moz-animation-fill-mode: forwards;
      animation-fill-mode: forwards;
    }
    .captcha-wrong:after {
      opacity: 0;
      height: 75px;
      width: 37.5px;
      -webkit-transform-origin: left top;
      -moz-transform-origin: left top;
      -ms-transform-origin: left top;
      -o-transform-origin: left top;
      transform-origin: left top;
      border-right: 15px solid #7c0000;
      border-radius: 2.5px !important;
      content: '';
      left: 25px;
      position: absolute;
    }
    @-webkit-keyframes wrong {
      0% {
        height: 0;
        width: 0;
        opacity: 0;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
    @-moz-keyframes wrong {
      0% {
        height: 0;
        width: 0;
        opacity: 1;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
    @keyframes wrong {
      0% {
        height: 0;
        width: 0;
        opacity: 1;
      }
      20% {
        height: 0;
        width: 37.5px;
        opacity: 1;
      }
      40% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
      100% {
        height: 75px;
        width: 37.5px;
        opacity: 1;
      }
    }
  `;
  let font = document.createElement('link');
  font.href = 'http://fonts.googleapis.com/css?family=Roboto';
  font.rel = 'stylesheet';
  font.type = 'text/css';
  document.head.appendChild(font);
  let icons = document.createElement('link');
  icons.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
  icons.rel = 'stylesheet';
  document.head.appendChild(icons);
  let style = document.createElement('style');
  style.innerHTML = body;
  document.head.appendChild(style);
}

function _base64ToArrayBuffer(base64) {
  var binary_string =  window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array( len );
  for (var i = 0; i < len; i++)        {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

