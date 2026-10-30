const config = {
  referenceFiles: [
    '../../src/theme/tokens/**/*.css',
    '../../src/theme/class/animation.css'
  ],
  plugins: ['stylelint-use-nesting', 'stylelint-declaration-strict-value'],
  rules: {
    'property-no-unknown': true,
    'declaration-property-value-no-unknown': true,
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
      'light-dark'
    ],
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        'background',
        'background-image',
        'border-radius',
        '/^border-(?:(?:top|bottom)-(?:left|right)|(?:start|end)-(?:start|end))-radius$/',
        'fill',
        'stroke',
        'box-shadow',
        'text-shadow',
        'font',
        'font-size',
        'font-weight',
        'z-index'
      ],
      {
        ignoreFunctions: false,
        ignoreValues: [
          '/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none|auto)$/i'
        ],
        expandShorthand: true,
        disableFix: true
      }
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
        'scale-unlimited/declaration-strict-value': null
      }
    }
  ]
}

export default config
