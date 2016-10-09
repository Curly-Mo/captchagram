window.addEventListener('load', init);

function init(){
  window.captchas = [];
  let captchas = document.querySelectorAll('.captchagram');
  captchas.forEach(function(container){
    let captcha = new Captchagram(container);
    window.captchas.push(captcha);
  });
  set_style();
}

class Captchagram{
  constructor(element){
    this.container = element;
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
    let container = document.createElement('div');
    container.classList.add('captcha-border');
    form.appendChild(container);
    container.classList.add('captcha-grid');
    let main = document.createElement('div');
    main.classList.add('captcha-main');
    main.classList.add('captcha-col2');
    container.appendChild(main);

    // Options Pane
    let options = document.createElement('div');
    options.classList.add('captcha-options');
    options.classList.add('captcha-col2');
    let refresh = document.createElement('button');
    refresh.innerHTML = '&#8635;';
    refresh.title = 'Request new challenge';
    refresh.addEventListener('click', function(e){
      e.preventDefault();
      captcha.requestChallenge();
    });
    options.appendChild(refresh);
    container.appendChild(options);

    let submit = document.createElement('input');
    submit.type = 'submit';
    form.appendChild(submit);

    this.main = main;
    this.options = options;
    return form;
  }

  item_ui(i){
    let captcha = this;

    let audio = new Audio();
    let play_button = document.createElement('button');
    play_button.innerHTML = '&#9654;';
    play_button.title = 'Play';
    play_button.classList.add('captcha-play-button');
    play_button.addEventListener('click', function(e){
      e.preventDefault();
      if(!audio.paused){
        audio.pause();
        this.innerHTML = '&#9654;';
        this.title = 'Play';
      }else{
        captcha.items.forEach(function(item){
          item.audio.pause();
          item.button.innerHTML = '&#9654;';
          item.button.title = 'Play';
        });
        audio.currentTime = 0;
        audio.play();
        this.innerHTML = '&#9724;';
        this.title = 'Stop Audio';
      }
    });

    let answer = document.createElement('input');
    answer.type = 'text';
    answer.name = 'answer'+i;
    answer.classList.add('captcha-textbox');
    let item = {
      audio: audio,
      button: play_button,
      answer: answer
    }
    audio.addEventListener('ended', function(e){
        //play_button.innerHTML = '&#8630;';
        play_button.innerHTML = '&#9654;';
        let index = captcha.items.indexOf(item);
        let next = captcha.items[index+1];
        if(next != null){
          next.button.click();
        }
    });

    return item;
  }

  attempt(){
    let captcha = this;
    let xhr = new XMLHttpRequest();
    xhr.onload = function(e){
      let response = xhr.response;
      console.log(response);
      if(response.success){
        alert('You are a real human bean!');
      }else{
        alert('Nice try, robot.');
        captcha.requestChallenge();
      }
    }
    let formdata = new FormData(this.form);
    formdata.append('token', captcha.token);
    let data = {};
    for(let pair of formdata){
      console.log(pair);
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

  requestChallenge(){
    let captcha = this;

    let xhr = new XMLHttpRequest();
    xhr.onload = function(e){
      let response = xhr.response;
      console.log(response);
      captcha.items.forEach(function(item){
        item.audio.pause();
      });

      captcha.token = response.token;

      captcha.main.innerHTML = '';
      captcha.items = [];
      let upper = document.createElement('div');
      let lower = document.createElement('div');
      upper.classList.add('captcha-grid');
      upper.classList.add('captcha-wrapper');
      lower.classList.add('captcha-grid');
      lower.classList.add('captcha-wrapper');
      captcha.main.appendChild(upper);
      captcha.main.appendChild(lower);
      for(let i=0; i<response.streams.length; i++){
        let item = captcha.item_ui(i);
        let wrapper = document.createElement('div');
        wrapper.classList.add('captcha-col'+response.streams.length);
        wrapper.appendChild(item.button);
        wrapper.appendChild(item.audio);
        upper.appendChild(wrapper);
        item.answer.classList.add('captcha-col'+response.streams.length);
        lower.appendChild(item.answer);

        item.audio.src = 'data:audio/wav;base64,' + response.streams[i];
        captcha.items.push(item);
      }
      let suggestions = document.createElement('div');
      suggestions.innerHTML = 'Eg. ' + response.suggestions;
      captcha.main.appendChild(suggestions);
    }
    let url = '/captcha/generate';
    xhr.open('GET', url);
    xhr.responseType = 'json';
    xhr.send();
  }
}

function set_style(){
  let body = `
    .captcha-col2{
      float: left;
      width: 50%;
      box-sizing: border-box;
      margin: 0.2em;
    }
    .captcha-main{
      width: 80%;
    }
    .captcha-options{
      width: 20%;
    }
    .captcha-play-button{
      width: 100%;
    }
    .captcha-grid{
      display: flex;
      clear: both;
    }
    .captcha-textbox{
      width: 100%;
      border: 1.5px solid;
    }
    .captcha-wrapper{
      padding: 0.2em;
    }
    .captcha-border{
      border: 1px solid #dfdfdf;
    }
  `;
  let style = document.createElement('style');
  style.innerHTML = body;
  document.head.appendChild(style);
}

