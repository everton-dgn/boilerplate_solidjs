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
})
