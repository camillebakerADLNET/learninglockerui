import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { InputField } from './InputField';

const PrimaryForm = ({
  primary,
  onChange,
  disabled,
}) => {
  const formId = uuidv4();
  return (
    <InputField className="form-group">
      <label htmlFor={formId}>
        Order
      </label>

      <input
        id={formId}
        className="form-control"
        onChange={onChange}
        value={primary}
        type="number"
        disabled={disabled} />
    </InputField>
  );
};

export default PrimaryForm;
