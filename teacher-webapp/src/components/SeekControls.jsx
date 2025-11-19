import React from "react";
import PropTypes from "prop-types";

export const SeekControls = ({
  disabled,
  seekingDirection,
  onSeekBackward,
  onSeekForward,
}) => {
  const isBusy = Boolean(seekingDirection);

  return (
    <div className="seek-controls">
      <button
        type="button"
        className="seek-button"
        disabled={disabled || isBusy}
        onClick={onSeekBackward}
      >
        {seekingDirection === "backward" ? "Seeking..." : "-10s"}
      </button>
      <button
        type="button"
        className="seek-button"
        disabled={disabled || isBusy}
        onClick={onSeekForward}
      >
        {seekingDirection === "forward" ? "Seeking..." : "+10s"}
      </button>
    </div>
  );
};

SeekControls.propTypes = {
  disabled: PropTypes.bool,
  seekingDirection: PropTypes.oneOf([null, "backward", "forward"]),
  onSeekBackward: PropTypes.func.isRequired,
  onSeekForward: PropTypes.func.isRequired,
};

SeekControls.defaultProps = {
  disabled: false,
  seekingDirection: null,
};
