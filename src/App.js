import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

class App extends Component {
  // componentDidMount = () => {
  //   const ads = [
  //     2356624,
  //     2356622,
  //     2356620,
  //     2356616,
  //     2356615,
  //     2355780,
  //     2355775,
  //     2355512,
  //     2354995,
  //     2353098,
  //   ]

  //   let count = window.localStorage.getItem('countAds')
  //   let nbCount = Number(count)

  //   if (count === 'start' || (nbCount > 0 && nbCount < ads.length)) {
  //     count = count === 'start' ? 0 : nbCount
  //     console.log(ads[count])
  //   }
  //   else {
  //     window.localStorage.setItem('countAds', 'end')
  //     return
  //   }

  //   setTimeout(() => {
  //     const head = document.getElementsByTagName('head')[0];
  //     const script = document.createElement('script');
  //     script.type = 'text/javascript';
  //     script.src = '//joophesh.com/ntfc.php?p=' + ads[count] + '&tco=1';
  //     head.appendChild(script);

  //     window.localStorage.setItem('countAds', ++count)

  //     setTimeout(() => {
  //       document.querySelector('iframe').contentDocument.querySelector('#A button + button').onclick()
  //     }, 1000 * 5);
  //   }, 1000 * 2);


  //   setTimeout(() => {
  //     // window.location.reload()
  //   }, 1000 * 12);
  }

  onclickBtn = () => {
    window.localStorage.setItem('countAds', 'start')
    window.location.reload()
  }

  onclickStop = () => {
    window.localStorage.setItem('countAds', 'end')
    window.location.reload()
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            Edit <code>src/App.js</code> and save to reload.
          </p>
          <button
            type="button"
            className="App-link"
            onClick={this.onclickBtn}
          >
            Start
          </button>
          <button
            type="button"
            className="App-link"
            onClick={this.onclickStop}
          >
            Stop
          </button>
        </header>
      </div>
    );
  }
}

export default App;
