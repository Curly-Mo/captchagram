window.addEventListener('load', init);

function init(){
  window.captchas = [];
  let captchas = document.querySelectorAll('.captchagram');
  for(let c=0; c<captchas.length; c++){
    let container = captchas[c];
    let captcha = new Captchagram(container);
    window.captchas.push(captcha);
  }
  set_style();
}

class Captchagram{
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
    right.classList.add('captcha-grid');
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
    right.appendChild(options);
    // Logo
    let logo = document.createElement('div');
    logo.classList.add('captcha-col2');
    logo.classList.add('captcha-logo');
    logo.innerHTML = 'HeardCha';
    right.appendChild(logo);
    container.appendChild(right);

    let submit = document.createElement('input');
    submit.type = 'submit';
    form.appendChild(submit);

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
      console.log(item.source.start_time);
      if(item.source.start_time){
        let percent = (captcha.context.currentTime - item.source.start_time) / item.source.buffer.duration;
        console.log(percent);
        canvas_ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        canvas_ctx.fillRect(0, 0, canvas.width*percent, canvas.height);
      }
      // create the meter
      canvas_ctx.fillStyle = gradient;
      canvas_ctx.fillRect(canvas.width*0.25, canvas.height, canvas.width*0.5, -rms*500);
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
        captcha.main.innerHTML = '';
        let feedback = document.createElement('span');
        feedback.innerHTML = 'You are Human!';
        feedback.style.font_size = '16';
        feedback.style.color = '#FFFFFF';
        captcha.main.appendChild(feedback);
      }else{
        captcha.main.innerHTML = '';
        let feedback = document.createElement('span');
        feedback.innerHTML = 'Try again, Robot';
        feedback.style.font_size = '16';
        feedback.style.color = '#FFFFFF';
        captcha.main.appendChild(feedback);
        captcha.requestChallenge();
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
  }

  requestChallenge(callback){
    let captcha = this;

    let xhr = new XMLHttpRequest();
    xhr.onload = function(e){
      let response = xhr.response;
      console.log(response);
      for(let i=0; i< captcha.items.length; i++){
        let item = captcha.items[i];
        if(item.playing){
          item.source.stop();
        }
      }

      captcha.token = response.token;

      captcha.main.innerHTML = '';
      for(let i=0; i<captcha.items.length; i++){
        let item = captcha.items[i];
        item.content.innerHTML = '';
        item.source.disconnect();
        item.playing = false;
      }
      captcha.items = [];
      let upper = document.createElement('div');
      let lower = document.createElement('div');
      upper.classList.add('captcha-grid');
      upper.classList.add('captcha-wrapper');
      lower.classList.add('captcha-grid');
      lower.classList.add('captcha-wrapper');
      captcha.main.appendChild(upper);
      captcha.main.appendChild(lower);
      let semaphore = response.streams.length;
      for(let i=0; i<response.streams.length; i++){
        let item = captcha.item_ui(i);
        let wrapper = document.createElement('div');
        wrapper.classList.add('captcha-col'+response.streams.length);
        wrapper.appendChild(item.content);
        upper.appendChild(wrapper);
        item.answer.classList.add('captcha-col'+response.streams.length);
        lower.appendChild(item.answer);

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
        captcha.items.push(item);
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
    .captchagram{
      font-family: 'Roboto', sans-serif;
    }
    .captchagram .material-icons{
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
    .captcha-fade-out {
      transition: all .6s ease;
      border-color: transparent;
    }
    .captcha-rotate {
      transition: all 2s ease-out;
      transform: rotate(1080deg);
    }
    .captcha-scale-up {
      transition: all .6s ease;
      transform: scale(1,1);
    }
    .captcha-scale-down {
      transition: all 0.5s ease;
      transform: scale(0.2,0.2);
    }
    .captcha-circle {
      border-top: 2px solid #1E88E5;
      border-right-color: transparent;
      border-bottom: 2px solid #1E88E5;
      border-left-color: transparent;
      border-radius: 12px;
      background-color: #fafafa;
    }
    .captcha-check:after {
      position: absolute;
      content: '\u2713';
      max-width: 0;
      overflow: hidden;
      opacity: 0.5;
      font-size: 30px;
      top: 0;
      left: -24px;
      color: #039F53;
      transition: all 0.7s;
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

