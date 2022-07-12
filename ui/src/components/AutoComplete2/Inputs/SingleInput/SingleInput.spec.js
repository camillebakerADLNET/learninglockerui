import React from 'react';
import 'jest-styled-components';
import renderer from 'react-test-renderer';
import SingleInput from './SingleInput';
import { expect } from 'chai';

describe('SingleInput', () => {
  test('should render', () => {
    // const mockRenderOption = jest.fn();

    // const singleInput = renderer
    //   .create(<SingleInput selectedOption="test6" renderOption={mockRenderOption} />)
    //   .toJSON();

    const mockRenderOption = jest.fn();

    const singleInput = renderer
      .create(<SingleInput selectedOption="test6" renderOption={mockRenderOption} />)
      .toJSON();

    console.log(singleInput);
  });
});
