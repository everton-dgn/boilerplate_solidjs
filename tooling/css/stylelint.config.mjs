const VAR = String.raw`var\(\s*--[a-z0-9-]+\s*\)`
const TOKEN = String.raw`/^${VAR}(?:\s*[,/]\s*${VAR}|\s+${VAR})*$/`
// line-height não tem token, então o font abreviado aceita a altura crua.
const LINE_HEIGHT = String.raw`(?:\d*\.?\d+(?:%|[a-z]+)?|normal)`
const FONT_TOKEN = String.raw`/^${VAR}(?:\s+${VAR})*(?:\s*\/\s*(?:${LINE_HEIGHT}|${VAR})(?:\s+${VAR})*)?$/`
const TOKEN_KEYWORDS =
  '/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none|auto)$/i'
// O CSS aceita nomes de propriedade em maiúsculas e com prefixo de fornecedor.
const property = names => String.raw`/^(?!--)(?:-[a-z]+-)?(?:${names})$/i`
// [propriedade, famílias de token aceitas, formato do valor]
const TOKEN_PROPERTIES = [
  [property('(?:[a-z]+-)*color|fill|stroke'), ['/^--color-/']],
  [property('(?:[a-z]+-)*radius'), ['/^--radius-/']],
  [property('background'), ['/^--(?:color|gradient)-/']],
  [property('background-image'), ['/^--gradient-/']],
  [property('box-shadow'), ['/^--(?:shadow|ring)-/']],
  // Não há token de sombra de texto: só as palavras-chave passam.
  [property('text-shadow'), []],
  [property('font'), ['/^--font-/'], FONT_TOKEN],
  [property('font-size'), ['/^--font-size-/']],
  [property('font-weight'), ['/^--font-weight-/']],
  [property('z-index'), ['/^--z-index-/']],
  // Uma custom property local com nome de família só repassa tokens dela.
  ...[
    'color',
    'gradient',
    'radius',
    'shadow',
    'ring',
    'font-size',
    'font-weight',
    'z-index'
  ].map(family => [`/^--${family}-/`, [`/^--${family}-/`]]),
  ['/^--font-(?!size-|weight-)/', ['/^--font-/'], FONT_TOKEN]
]
// A checagem por tipo pula valores com var() que ela não resolve; a busca pelo
// nome alcança fallbacks e custom properties. Inclui as obsoletas e as do WebKit.
const SYSTEM_COLORS = `
  AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText
  Canvas CanvasText Field FieldText GrayText Highlight HighlightText LinkText
  Mark MarkText SelectedItem SelectedItemText VisitedText
  ActiveBorder ActiveCaption AppWorkspace Background ButtonHighlight
  ButtonShadow CaptionText InactiveBorder InactiveCaption InactiveCaptionText
  InfoBackground InfoText Menu MenuText Scrollbar ThreeDDarkShadow ThreeDFace
  ThreeDHighlight ThreeDLightShadow ThreeDShadow Window WindowFrame WindowText
  -webkit-activelink -webkit-focus-ring-color -webkit-link -webkit-text
`
  .trim()
  .split(/\s+/u)
// Ponto, barra e # nas bordas afastam caminhos de url() e nomes de tokens.
const SYSTEM_COLOR = String.raw`/(?<![\w#./-])(?:${SYSTEM_COLORS.join('|')})(?![\w.-])/i`
// Propriedades sem cor que recebem nomes livres ou textos.
const NAME_PROPERTIES = String.raw`animation(?:-name)?|transition(?:-property)?|will-change|grid(?:-[a-z]+)*|container(?:-name)?|counter-(?:increment|reset|set)|view-transition-(?:class|name)|font-family|content|quotes|list-style(?:-type)?|page`

const config = {
  referenceFiles: [
    '../../src/theme/tokens/**/*.css',
    '../../src/theme/class/animation.css'
  ],
  reportDescriptionlessDisables: true,
  plugins: ['stylelint-use-nesting'],
  rules: {
    'property-no-unknown': true,
    'declaration-property-value-no-unknown': true,
    'value-no-invalid': true,
    'unit-no-unknown': true,
    'color-no-invalid-hex': true,
    'color-no-hex': true,
    'color-named': 'never',
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-syntaxes'] }
    ],
    'declaration-block-no-shorthand-property-overrides': true,
    'selector-pseudo-class-no-unknown': true,
    'selector-pseudo-element-no-unknown': true,
    'selector-type-no-unknown': true,
    'at-rule-no-unknown': true,
    'no-unknown-animations': true,
    'no-unknown-custom-properties': true,
    'custom-property-no-missing-var-function': true,
    'custom-property-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'selector-no-invalid': true,
    'selector-no-deprecated': true,
    'selector-no-unmatchable': true,
    'at-charset-rule-no-invalid': true,
    'media-query-no-invalid': true,
    'media-feature-name-no-unknown': true,
    'media-feature-name-value-no-unknown': true,
    'function-calc-no-unspaced-operator': true,
    'no-invalid-position-at-import-rule': true,
    'no-duplicate-selectors': true,
    'keyframe-block-no-duplicate-selectors': true,
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
      'color-mix',
      'light-dark',
      'contrast-color',
      'device-cmyk'
    ],
    'value-type-custom-property-required-list': [
      ['color'],
      { ignoreValues: [TOKEN_KEYWORDS] }
    ],
    'declaration-property-value-allowed-list': [
      Object.fromEntries(
        TOKEN_PROPERTIES.map(([name, , value = TOKEN]) => [
          name,
          [value, TOKEN_KEYWORDS]
        ])
      ),
      {
        message:
          'Use só tokens com var() nesta propriedade; exceções pedem stylelint-disable com o motivo.'
      }
    ],
    'declaration-property-custom-property-allowed-list': [
      Object.fromEntries(
        TOKEN_PROPERTIES.map(([name, families]) => [name, families])
      ),
      { message: 'A propriedade "%s" não aceita o token "%s".' }
    ],
    'declaration-property-value-disallowed-list': [
      {
        [String.raw`/^(?!(?:-[a-z]+-)?(?:${NAME_PROPERTIES})$)/i`]: [
          SYSTEM_COLOR
        ]
      },
      { message: 'Cores de sistema ficam em src/theme/.' }
    ],
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$',
      { message: 'Use snake_case nas classes CSS, como variant_default.' }
    ],
    'max-nesting-depth': 2,
    'nesting-selector-no-missing-scoping-root': true,
    'csstools/use-nesting': 'always'
  },
  overrides: [
    {
      files: ['../../src/theme/**/*.css'],
      rules: {
        'function-disallowed-list': [
          'rgb',
          'rgba',
          'hsl',
          'hsla',
          'hwb',
          'lab',
          'lch',
          'color'
        ],
        'value-type-custom-property-required-list': null,
        'declaration-property-value-allowed-list': null,
        'declaration-property-custom-property-allowed-list': null,
        'declaration-property-value-disallowed-list': null
      }
    }
  ]
}

export default config
