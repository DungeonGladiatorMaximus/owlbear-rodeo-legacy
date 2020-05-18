import React, { useRef, useContext } from "react";
import { Box, Image } from "theme-ui";

import TokenLabel from "../token/TokenLabel";
import TokenStatus from "../token/TokenStatus";

import usePreventTouch from "../../helpers/usePreventTouch";
import useDataSource from "../../helpers/useDataSource";

import AuthContext from "../../contexts/AuthContext";

import { tokenSources } from "../../tokens";

function MapToken({ token, tokenState, tokenSizePercent, className }) {
  const { userId } = useContext(AuthContext);
  const imageSource = useDataSource(token, tokenSources);

  const imageRef = useRef();
  // Stop touch to prevent 3d touch gesutre on iOS
  usePreventTouch(imageRef);

  return (
    <Box
      style={{
        transform: `translate(${tokenState.x * 100}%, ${tokenState.y * 100}%)`,
        width: "100%",
        height: "100%",
        transition:
          tokenState.lastEditedBy === userId
            ? "initial"
            : "transform 0.5s ease",
      }}
      sx={{
        position: "absolute",
        pointerEvents: "none",
      }}
    >
      <Box
        style={{
          width: `${tokenSizePercent * (tokenState.size || 1)}%`,
        }}
        sx={{
          position: "absolute",
          pointerEvents: "all",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            display: "flex", // Set display to flex to fix height being calculated wrong
            width: "100%",
            flexDirection: "column",
          }}
        >
          <Image
            className={className}
            sx={{
              userSelect: "none",
              touchAction: "none",
              width: "100%",
              // Fix image from being clipped when transitioning
              willChange: "transform",
            }}
            src={imageSource}
            // pass id into the dom element which is then used by the ProxyToken
            data-id={tokenState.id}
            ref={imageRef}
          />
          {tokenState.statuses && (
            <TokenStatus statuses={tokenState.statuses} />
          )}
          {tokenState.label && <TokenLabel label={tokenState.label} />}
        </Box>
      </Box>
    </Box>
  );
}

export default MapToken;
