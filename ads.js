const puppeteer = require('puppeteer');
const sites = [
  986200,
]
let count = 0
let mainPage

const rand = (max, min) => {
  return Math.floor(Math.random() * Math.floor(max) + (typeof min !== 'undefined' ? min : 0));
}

let tempUrl
const url = () => {
  let newUrl = urls[rand(urls.length)]
  while (newUrl === tempUrl) {
    newUrl = urls[rand(urls.length)]
  }
  tempUrl = newUrl
  return newUrl
}

const catchFct = async (e) => {
  try {
    await page.goto('about:blank')
    await page.close()
  }
  catch (e) { }

  console.log(getTime() + " ERROR ", account, e)
}

const newPage = async (userDataDir) => {
  const params = {
    executablePath: '/usr/bin/google-chrome-stable',
    userDataDir,
    headless: false,
    // defaultViewport: {
    //   width: 720,
    //   height: 450,
    // }
    // slowMo: 200,
  }

  let browser

  try {
    browser = await puppeteer.launch(params);
  }
  catch (e) {
    params.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    browser = await puppeteer.launch(params);
  }

  const pages = await browser.pages()
  const page = pages[0]

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  page.gotoUrl = async (url) => {
    try {
      await page.goto(url, { timeout: 1000 * 60 * 5, waitUntil: 'domcontentloaded' })
      return true
    } catch (error) {
      throw 'error connect ' + account
      return false
    }
  }

  page.wfs = async (selector, timeout = 1000 * 60 * 3, retry = false) => {
    try {
      await page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      if (retry) {
        throw 'Selector :' + selector + ' not found'
      }
      else {
        await page.reload()
        await wfs(selector, timeout, true)
      }
    }
  }

  page.ext = async (selector, timeout = 1000 * 10) => {
    try {
      await page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      return false
    }
  }

  page.clk = async (selector) => {
    const exist = await page.wfs(selector)

    try {
      await page.waitFor(2000 + rand(2000))
      await page.evaluate(selector => {
        document.querySelector(selector) && document.querySelector(selector).click()
      }, selector)

      return true
    }
    catch (e) {
      console.log('Click error ' + selector, account, 'exist :' + exist)
      return false
    }
  }

  page.jClk = async (selector) => {
    const exist = await page.ext(selector)
    if (!exist) { return false }

    try {
      await page.waitFor(2000 + rand(2000))
      await page.evaluate(selector => {
        document.querySelector(selector) && document.querySelector(selector).click()
      }, selector)
      return true
    }
    catch (e) {
      console.log('Justclick ' + selector, account)
    }

  }

  page.inst = async (selector, text) => {
    await page.clk(selector)

    try {
      await page.waitFor(2000 + rand(2000))
      const elementHandle = await page.$(selector);
      await page.evaluate(selector => {
        document.querySelector(selector).value = ''
      }, selector)
      await elementHandle.type(text, { delay: 300 });

      return true
    }
    catch (e) {
      console.log('Insert error ' + selector, account)
    }
  }

  page.get = async (selector) => {
    const exist = await page.wfs(selector)

    try {
      await page.waitFor(2000 + rand(2000))
      const links = await page.evaluate(selector => {
        const list = document.querySelectorAll(selector)
        const arr = Array.prototype.slice.call(list).map(el => el.href)
        return arr
      }, selector)

      return links
    }
    catch (e) {
      console.log('Click error ' + selector, account, 'exist :' + exist)
      return false
    }
  }

  return page;
}

const clickAds = async (links, nb) => {
  const href = links[nb]
  if (href) {
    await mainPage.gotoUrl(href)
  }
  else {
    await mainPage.close()
    return
  }

  await mainPage.waitFor(2000 + rand(2000))
  const url = await mainPage.evaluate(() => {
    return document.querySelector('.input-copy__textarea') && document.querySelector('.input-copy__textarea').innerHTML.split('src="')[1].split('" data')[0]
  })
  console.log(url)
  if (url) {
    const adPage = await newPage()

    adPage.on('close', () => {
      clickAds(links, ++nb)
    })

    try {
      await adPage.gotoUrl('https://adspublisher.herokuapp.com/')
      await adPage.addScriptTag({
        url
      })
    }
    catch (e) { }
  }
  else {
    clickAds(links, ++nb)
  }
}

const main = async (siteId) => {
  await mainPage.gotoUrl('https://publishers.propellerads.com/#/pub/sites/site/' + siteId)
  await mainPage.waitFor(2000 + rand(2000))
  await mainPage.select('.site__zones-type select', 'string:pusherpps')
  await mainPage.waitFor(2000 + rand(2000))
  let links = await mainPage.get('.site__zone-tag .site__zone-action')
  clickAds(links, 0)
}

const launch = async () => {
  mainPage = await newPage('main')
  await mainPage.gotoUrl('https://publishers.propellerads.com/#/pub/auth')
  const notLog = await mainPage.ext('#username')

  if (notLog) {
    await mainPage.inst('#username', 'assoune.mike@gmail.com')
    await mainPage.inst('#password', '055625f7430@')
    await mainPage.clk('.login__form button')
  }

  main(sites[count])
}

launch()