import { useCallback } from 'react';

export interface ParameterDefinition {
  name: string;
  type: string;
  default?: unknown;
  values?: string[];
}

interface ParameterFormProps {
  parameter: ParameterDefinition;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

export default function ParameterForm({
  parameter,
  value,
  onChange,
}: ParameterFormProps) {
  const { name, type, values } = parameter;

  const handleChange = useCallback(
    (newValue: unknown) => onChange(name, newValue),
    [name, onChange],
  );

  const isDefault = JSON.stringify(value) === JSON.stringify(parameter.default);

  return (
    <div className="param-explorer-field">
      <label className="param-explorer-field__label">
        <span className="param-explorer-field__name">{name}</span>
        <span className="param-explorer-field__type">{type}</span>
        {isDefault && (
          <span className="param-explorer-field__badge">default</span>
        )}
      </label>

      <div className="param-explorer-field__input">
        {values && values.length > 0 ? (
          <select
            value={String(value ?? '')}
            onChange={(e) => handleChange(e.target.value)}
            className="param-explorer-select"
          >
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : type === 'boolean' ? (
          <button
            type="button"
            className={`param-explorer-toggle ${value === true || value === 'true' ? 'param-explorer-toggle--on' : ''}`}
            onClick={() => {
              const boolVal = value === true || value === 'true';
              handleChange(!boolVal);
            }}
          >
            {value === true || value === 'true' ? 'true' : 'false'}
          </button>
        ) : type === 'number' ? (
          <input
            type="number"
            className="param-explorer-input"
            value={String(value ?? '')}
            onChange={(e) => handleChange(Number(e.target.value))}
          />
        ) : type === 'stepList' ||
          type === 'jobList' ||
          type === 'stageList' ||
          type === 'object' ? (
          <div className="param-explorer-readonly">
            <pre>
              {typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value ?? '')}
            </pre>
          </div>
        ) : (
          <input
            type="text"
            className="param-explorer-input"
            value={String(value ?? '')}
            onChange={(e) => handleChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
