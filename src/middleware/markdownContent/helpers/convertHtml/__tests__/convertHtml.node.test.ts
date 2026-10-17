import { convertHtml } from '../index.ts'

const INTERFACE = [
  '<dialog><h2>Dialog title</h2><p>Dialog body</p></dialog>',
  '<div role="dialog"><p>Role dialog</p></div>',
  '<output aria-live="polite">Polite update</output>',
  '<div role="alert" aria-live="assertive">Alert update</div>',
  '<div role="status">Status update</div>',
  '<form><label for="name">Form label</label><input id="name"></form>',
  '<fieldset><legend>Fieldset legend</legend></fieldset>',
  '<label>Loose label</label>',
  '<div role="button" tabindex="0">Role button</div>',
  '<div role="tablist"><span role="tab">Role tab</span></div>',
  '<span role="tooltip">Role tooltip</span>',
  '<span role="switch" aria-checked="false">Role switch</span>',
  '<div role="search">Role search</div>',
  '<search>Search element</search>',
  '<video controls>Video fallback</video>',
  '<audio controls>Audio fallback</audio>',
  '<canvas>Canvas fallback</canvas>',
  '<object data="/file.pdf">Object fallback</object>',
  '<progress value="5" max="10">Progress fallback</progress>',
  '<div hidden>Hidden content</div>'
]

const CONTENT = [
  '<div hidden="until-found">Searchable section</div>',
  '<div aria-live="off">Static region</div>',
  '<details><summary>Question</summary><p>Answer</p></details>'
]

const UNSAFE_LINKS = [
  '<a href="javascript:void(0)">Script link</a>',
  '<a href="JaVaScRiPt:alert(1)">Mixed case link</a>',
  '<a href="javascript&#58;alert(1)">Encoded link</a>',
  '<a href="vbscript:msgbox(1)">Legacy link</a>',
  '<a href="data:text/html,page">Data link</a>'
]

const IMAGES_WITHOUT_ALT = [
  '<img src="/decorative.png" alt="">',
  '<img src="/missing.png">',
  '<img src="/blank.png" alt="  ">',
  '<img>'
]

describe('markdown conversion filters', () => {
  it('keeps interface elements out and preserves content', async () => {
    const markdown = await convertHtml({
      response: new Response(
        `<main><h1>Title</h1>${INTERFACE.join('')}${CONTENT.join('')}</main>`
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('# Title')
    expect(markdown).not.toMatch(
      /Dialog|Role |Polite|Alert|Status|label|legend|fallback|element|Hidden/u
    )
    for (const text of ['Searchable section', 'Static region', 'Answer']) {
      expect(markdown).toContain(text)
    }
  })

  it('replaces script and data link destinations with a fragment', async () => {
    const markdown = await convertHtml({
      response: new Response(
        `<main><p>${UNSAFE_LINKS.join(' ')} <a href=" java&#x09;script:alert(1)">Spaced link</a> <a href="/about">About</a></p><a href="javascript:void(0)"><h3>&lt;img src=x onerror=alert(1)&gt;</h3></a></main>`
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).not.toMatch(/\]\(<?(?:javascript|vbscript|data):/iu)
    for (const text of [
      'Script link',
      'Mixed case link',
      'Encoded link',
      'Legacy link',
      'Data link'
    ]) {
      expect(markdown).toContain(`[${text}](#)`)
    }
    expect(markdown).toContain('[Spaced link](<https://example.com/en/ ')
    expect(markdown).not.toMatch(/^<h3>/mu)
    expect(markdown).toContain('[About](https://example.com/about)')
  })

  it('drops images without alt text or title', async () => {
    const markdown = await convertHtml({
      response: new Response(
        `<header><img></header><main><p>${IMAGES_WITHOUT_ALT.join(' ')} <img src="/chart.png" alt="Sales chart"> <img src="/titled.png" title="Quarterly sales"></p></main>`
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).not.toMatch(/decorative|missing|blank|!\[\]\(\)/u)
    expect(markdown).toContain('![Sales chart](https://example.com/chart.png)')
    expect(markdown).toContain(
      '![](https://example.com/titled.png "Quarterly sales")'
    )
  })

  it('drops unsafe links inside raw HTML regions', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><details><summary>Example</summary><a href="javascript:void(0)"><pre><code>&lt;img src=x onerror=alert(1)&gt;</code></pre></a></details></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).not.toContain('<a href=')
    expect(markdown).toMatch(/^```/mu)
  })

  it('keeps images without alt text outside plain containers', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Install it. <strong><img src="/warning.png" alt=""> Warning:</strong> <em><span><img src="/tip.png" alt=""></span> Tip</em> <a href="/home"><img src="/logo.png" alt=""></a></p><p><mark><img src="/mark.png" alt=""><br>&lt;img src=x onerror=alert(1)&gt;</mark></p><a><img src="/cover.png" alt=""><h3>&lt;img src=x onerror=alert(1)&gt;</h3></a></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    for (const image of ['warning', 'tip', 'logo', 'mark', 'cover']) {
      expect(markdown).toContain(`https://example.com/${image}.png`)
    }
    expect(markdown).not.toMatch(/^<h3>/mu)
    expect(markdown).not.toMatch(/^<mark>\s*$/mu)
  })
})
