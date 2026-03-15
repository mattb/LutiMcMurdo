import React from 'react';
import type { DimensionValue } from 'react-native';
import {View} from 'react-native';
import PropTypes from 'prop-types';

type SpacerProps = {
  horizontal?: boolean;
  size: DimensionValue;
  vertical?: boolean;
};

const Spacer = ({horizontal = false, size, vertical = false}: SpacerProps) => {
  const defaultValue: DimensionValue = 'auto';
  const isHorizontal = vertical ? false : horizontal;

  return (
    <View
      style={{
        width: isHorizontal ? size : defaultValue,
        height: !isHorizontal ? size : defaultValue,
      }}
    />
  );
};

Spacer.propTypes = {
  size: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
  ]).isRequired,
  horizontal: PropTypes.bool,
  vertical: PropTypes.bool,
};

Spacer.defaultProps = {
  horizontal: false,
  vertical: false,
};

export default Spacer;
