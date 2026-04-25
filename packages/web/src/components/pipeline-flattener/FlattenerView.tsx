import { useState } from 'react';

export interface TemplateSource {
  path: string;
  depth: number;
  location: string;
}

interface FlattenerViewProps {
  originalYaml: string;
  flattenedYaml: string | null;
  templateSources: TemplateSource[];
  filesLoaded: string[];
  errors: string[];
  loading: boolean;
}

const TEMPLATE_COLORS = [
  '#89b4fa', // blue
  '#cba6f7', // purple
  '#f9e2af', // yellow
  '#a6e3a1', // green
  '#f38ba8', // red
  '#fab387', // orange
  '#94e2d5', // teal
  '#74c7ec', // sky
];

function colorForIndex(i: number): string {
  return TEMPLATE_COLORS[i % TEMPLATE_COLORS.length];
}

function YamlHighlight({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <pre className="flattener-yaml">
      <code>
        {lines.map((line, i) => (
          <span key={i} className="flattener-yaml__line">
            <span className="flattener-yaml__line-num">{i + 1}</span>
            <YamlLine line={line} />
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}

function YamlLine({ line }: { line: string }) {
  // Comment
  if (line.trimStart().startsWith('#')) {
    return <span className="flattener-yaml--comment">{line}</span>;
  }
  // Key: value
  const match = line.match(/^(\s*)([\w${}.\-/@ ]+?)(:)(.*)/);
  if (match) {
    const [, indent, key, colon, rest] = match;
    return (
      <>
        {indent}
        <span className="flattener-yaml--key">{key}</span>
        <span className="flattener-yaml--colon">{colon}</span>
        <YamlValue value={rest} />
      </>
    );
  }
  // List item
  const listMatch = line.match(/^(\s*)(- )(.*)/);
  if (listMatch) {
    const [, indent, dash, rest] = listMatch;
    return (
      <>
        {indent}
        <span className="flattener-yaml--dash">{dash}</span>
        <YamlValue value={rest} />
      </>
    );
  }
  return <span>{line}</span>;
}

function YamlValue({ value }: { value: string }) {
  if (!value.trim()) return <span>{value}</span>;
  // String values
  if (
    value.trimStart().startsWith("'") ||
    value.trimStart().startsWith('"')
  ) {
    return <span className="flattener-yaml--string">{value}</span>;
  }
  // Boolean / null
  const trimmed = value.trim();
  if (/^(true|false|null|yes|no)$/i.test(trimmed)) {
    return <span className="flattener-yaml--bool">{value}</span>;
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return <span className="flattener-yaml--number">{value}</span>;
  }
  return <span className="flattener-yaml--value">{value}</span>;
}

export default function FlattenerView({
  originalYaml,
  flattenedYaml,
  templateSources,
  filesLoaded,
  errors,
  loading,
}: FlattenerViewProps) {
  const [activeTab, setActiveTab] = useState<'original' | 'flattened'>(
    'original',
  );

  return (
    <div className="flattener-view">
      {/* Left pane: template tree */}
      <div className="flattener-view__left">
        <h3 className="flattener-view__section-title">Template Sources</h3>
        {filesLoaded.length === 0 && !loading && (
          <p className="flattener-view__empty">No templates expanded yet.</p>
        )}
        <ul className="flattener-tree">
          {filesLoaded.map((file, i) => (
            <li
              key={file}
              className="flattener-tree__item"
              style={{ borderLeftColor: colorForIndex(i) }}
            >
              <span
                className="flattener-tree__dot"
                style={{ background: colorForIndex(i) }}
              />
              {file}
            </li>
          ))}
        </ul>

        {templateSources.length > 0 && (
          <>
            <h3 className="flattener-view__section-title">Expansions</h3>
            <ul className="flattener-tree">
              {templateSources.map((src, i) => (
                <li
                  key={`${src.path}-${i}`}
                  className="flattener-tree__item"
                  style={{
                    paddingLeft: `${src.depth * 12 + 8}px`,
                    borderLeftColor: colorForIndex(i + 1),
                  }}
                >
                  <span className="flattener-tree__badge">{src.location}</span>
                  {src.path}
                </li>
              ))}
            </ul>
          </>
        )}

        {errors.length > 0 && (
          <>
            <h3 className="flattener-view__section-title flattener-view__section-title--error">
              Errors
            </h3>
            <ul className="flattener-tree flattener-tree--errors">
              {errors.map((err, i) => (
                <li key={i} className="flattener-tree__item--error">
                  {err}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Right pane: YAML content */}
      <div className="flattener-view__right">
        <div className="flattener-view__tabs">
          <button
            className={`flattener-view__tab ${activeTab === 'original' ? 'flattener-view__tab--active' : ''}`}
            onClick={() => setActiveTab('original')}
            type="button"
          >
            Original
          </button>
          <button
            className={`flattener-view__tab ${activeTab === 'flattened' ? 'flattener-view__tab--active' : ''}`}
            onClick={() => setActiveTab('flattened')}
            type="button"
            disabled={!flattenedYaml}
          >
            Flattened {loading && '⏳'}
          </button>
        </div>
        <div className="flattener-view__yaml-container">
          {activeTab === 'original' && <YamlHighlight text={originalYaml} />}
          {activeTab === 'flattened' && flattenedYaml && (
            <YamlHighlight text={flattenedYaml} />
          )}
          {activeTab === 'flattened' && !flattenedYaml && loading && (
            <div className="flattener-view__loading">
              Expanding templates…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
