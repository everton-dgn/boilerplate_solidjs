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

  it('drops images without alt text inside emphasis', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Install it. <strong><img src="/warning.png" alt=""> Warning:</strong> read. <em><span><img src="/tip.png" alt=""></span> Tip</em> <del><img src="/old.png" alt="">Old</del></p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).not.toMatch(/\/(?:warning|tip|old)\.png/u)
    expect(markdown).toContain('Install it. **Warning:** read. *Tip* ~~Old~~')
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
        '<main><p>Install it. <a href="/home"><img src="/logo.png" alt=""></a></p><p><mark><img src="/mark.png" alt=""><br>&lt;img src=x onerror=alert(1)&gt;</mark></p><a><img src="/cover.png" alt=""><h3>&lt;img src=x onerror=alert(1)&gt;</h3></a></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    for (const image of ['logo', 'mark', 'cover']) {
      expect(markdown).toContain(`https://example.com/${image}.png`)
    }
    expect(markdown).not.toMatch(/^<h3>/mu)
    expect(markdown).not.toMatch(/^<mark>\s*$/mu)
  })

  it('keeps emphasis delimiters around content after a removed icon', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Install. <strong><svg><path d="M0 0"/></svg> Warning:</strong> read the notes.</p><p>Line one<br>===</p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('Install. **Warning:** read the notes.')
    expect(markdown).toContain('Line one  \n\\===')
  })

  it('keeps the space that opens emphasis before a removed icon', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Install it<strong> <svg><path d="M0 0"/></svg>now</strong> and read the notes.</p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('Install it **now** and read the notes.')
  })

  it('keeps the space that opens emphasis inside a wrapper', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Click<strong><span> <a href="/docs">here</a></span></strong> to start.</p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain(
      'Click **[here](https://example.com/docs)** to start.'
    )
  })

  it('keeps an empty heading in a list item apart from the next block', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><ul><li><h3></h3><p>Partner description</p></li></ul></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('- ###\n\n  Partner description')
  })

  it('starts a heading after inline text in a list item on its own block', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><ul><li>Intro<h3>Title</h3><p>Body</p></li></ul></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('- Intro\n\n  ### Title\n\n  Body')
  })

  it('labels an icon link with its accessible name', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Open the <a href="/cart" aria-label="Cart"><span aria-hidden="true">🛒</span></a> now.</p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('Open the [Cart](https://example.com/cart) now.')
  })

  it('moves the blank after a removed icon past the link', async () => {
    const markdown = await convertHtml({
      response: new Response(
        '<main><p>Open the<a href="/cart" aria-label="Cart"><span aria-hidden="true">🛒</span> </a>now.</p></main>'
      ),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toContain('Open the [Cart](https://example.com/cart) now.')
  })
})

describe('keeps word separators across inline wrappers', () => {
  it.each([
    ['<p>a<span> <span>b</span></span></p>', 'a b'],
    ['<p>a<span> <strong>b</strong></span></p>', 'a **b**'],
    ['<p>a<font> <b>x</b></font></p>', 'a **x**'],
    ['<p>a<abbr> <span>b</span></abbr></p>', 'a b'],
    ['<p>a<small> <span>b</span></small></p>', 'a b'],
    ['<p>a<u> <span>b</span></u></p>', 'a<u> b</u>'],
    ['<p>a<span><span> <span>b</span></span></span></p>', 'a b'],
    ['<p>a<span>\n  <span>b</span></span>c</p>', 'a bc'],
    ['<p>a<span> </span>b</p>', 'a b'],
    ['<p>a<span> <strong></strong></span>b</p>', 'a b'],
    ['<p>a<strong>x<span> <span>b</span></span></strong></p>', 'a**x b**'],
    ['<p><strong>a<span> </span></strong>b</p>', '**a** b'],
    [
      '<p>a<span> <img src="/i.png" alt="i"></span></p>',
      'a ![i](https://example.com/i.png)'
    ],
    ['<p>Total:<span> </span>&nbsp;<b>5</b></p>', 'Total:  **5**']
  ])('converts %s', async (html, expected) => {
    const markdown = await convertHtml({
      response: new Response(`<main>${html}</main>`),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toBe(expected)
  })
})

describe('preserves heading block boundaries and inline wrappers in list items', () => {
  it.each([
    [
      '<ul><li><figure><figcaption><q><h3>T</h3></q>s</figcaption></figure></li></ul>',
      '- *"### T"s*'
    ],
    [
      '<ul><li><figure><figcaption><q><h3></h3></q>s</figcaption></figure></li></ul>',
      '- *"### "s*'
    ],
    [
      '<ul><li><figure><figcaption><a href="/l"></a><h3>T</h3></figcaption></figure></li></ul>',
      '- *[](https://example.com/l)### T*'
    ],
    [
      '<ul><li><figure><figcaption><del><h3>T</h3></del></figcaption></figure></li></ul>',
      '- *~~### T~~*'
    ],
    [
      '<ul><li>Intro <h3>Title</h3><p>Body</p></li></ul>',
      '- Intro\n\n  ### Title\n\n  Body'
    ],
    [
      '<ul><li>Intro\n    <h3>Title</h3><p>Body</p></li></ul>',
      '- Intro\n\n  ### Title\n\n  Body'
    ],
    [
      '<ol><li>a<ol><li>b<ol><li>Intro <h3>T</h3></li></ol></li></ol></li></ol>',
      '1. a\n   1. b\n      1. Intro\n\n         ### T'
    ],
    ['<ul><li><h3></h3>Text</li></ul>', '- ###\n\n  Text'],
    ['<ol><li><h1>T</h1>\nx</li><li>y</li></ol>', '1. # T\n\n   x\n2. y'],
    [
      '<ul><li>a<ul><li>b<ul><li><h3></h3>c</li></ul></li></ul></li></ul>',
      '- a\n  - b\n    - ###\n\n      c'
    ],
    [
      '<ul><li><h3>Title</h3><strong>Text</strong></li></ul>',
      '- ### Title\n\n  **Text**'
    ],
    ['<ul><li><h3></h3><code>x</code></li></ul>', '- ###\n\n  `x`'],
    ['<ul><li><h3>T</h3><em></em>x</li></ul>', '- ### T\n\n  x'],
    ['<ul><li>x <h2></h2>  y</li></ul>', '- x\n\n  ##\n\n  y'],
    [
      '<blockquote><ul><li><h3>T</h3>x</li></ul></blockquote>',
      '> - ### T\n>\n>   x'
    ],
    ['<ul><li><strong><h3>T</h3>more</strong></li></ul>', '- **### T more**'],
    [
      '<ul><li><u><h4>T</h4></u>more</li></ul>',
      '- <u>\n\n  #### T</u>\n\n  more'
    ],
    [
      '<ol><li><small><abbr><h2>Title</h2></abbr></small>Body text</li><li>b</li></ol>',
      '1. ## Title\n\n   Body text\n2. b'
    ],
    [
      '<ul><li><small><strong><h3>T</h3></strong>more</small></li></ul>',
      '- **### T**more'
    ],
    ['<ol start="10"><li><h3>T</h3># x</li></ol>', '10. ### T\n\n    \\# x'],
    [
      '<ul><li>a<ul><li>T<br>- x</li></ul></li></ul>',
      '- a\n  - T  \n    \\- x'
    ],
    [
      '<ol start="10"><li><p>a</p><p>&gt; x</p></li><li>b</li></ol>',
      '10. a\n\n    \\> x\n11. b'
    ]
  ])('converts %s', async (html, expected) => {
    const markdown = await convertHtml({
      response: new Response(`<main>${html}</main>`),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toBe(expected)
  })
})

describe('preserves visible link text and spaces around accessible labels', () => {
  it.each([
    [
      '<div><a href="/x" title="Title"><div>Text</div></a></div>',
      '[Text](https://example.com/x "Title")'
    ],
    [
      '<p>Go <a href="/cart" aria-label="Cart"><style>.i{}</style>&#32;</a></p>',
      'Go [Cart](https://example.com/cart)'
    ],
    [
      '<a href="/cart" aria-label="Cart"><svg></svg>&#32;</a>',
      '[Cart](https://example.com/cart)'
    ],
    [
      '<p><a href="/c" aria-label="Item"><svg></svg> </a>Next</p>',
      '[Item](https://example.com/c) Next'
    ],
    [
      '<p><a href="/c" aria-label="Item"><svg></svg>&#32;</a>Next</p>',
      '[Item](https://example.com/c) Next'
    ],
    [
      '<p><a href="/c" aria-label="Item">\n  <svg aria-hidden="true"></svg>\n</a>Next</p>',
      '[Item](https://example.com/c) Next'
    ],
    [
      '<p>Go<a href="/c" aria-label="Item"><style>.i{}</style> </a>now</p>',
      'Go [Item](https://example.com/c) now'
    ],
    [
      '<p>Go<a href="/c" aria-label="Item"><svg></svg> <svg></svg> </a>Next</p>',
      'Go [Item](https://example.com/c) Next'
    ],
    [
      '<p>Go <a href="/c" aria-label="A"><svg></svg> <!-- c --></a>Next</p>',
      'Go [A](https://example.com/c) Next'
    ]
  ])('converts %s', async (html, expected) => {
    const markdown = await convertHtml({
      response: new Response(`<main>${html}</main>`),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toBe(expected)
  })
})

describe('restores heading breaks after discarded content', () => {
  it.each([
    ['<ul><li><h3>T</h3><a></a># x</li></ul>', '- ### T\n\n  \\# x'],
    [
      '<ul><li><h3>T</h3><span data-md-exclude>discarded</span># x</li></ul>',
      '- ### T\n\n  \\# x'
    ],
    ['<ul><li><h3>T</h3><strong>&#32;</strong>x</li></ul>', '- ### T\n\n  x'],
    [
      '<blockquote><ul><li><h3>T</h3># x</li></ul></blockquote>',
      '> - ### T\n>\n>   \\# x'
    ]
  ])('converts %s', async (html, expected) => {
    const markdown = await convertHtml({
      response: new Response(`<main>${html}</main>`),
      url: 'https://example.com/en/page',
      signal: new AbortController().signal
    })
    expect(markdown).toBe(expected)
  })
})
