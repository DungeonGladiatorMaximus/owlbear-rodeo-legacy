import React, { useState, useEffect, useRef } from "react";
import { Image as KonvaImage, Group, Line, Rect, Circle } from "react-konva";
import { useSpring, animated } from "react-spring/konva";
import useImage from "use-image";
import Konva from "konva";

import useDebounce from "../../hooks/useDebounce";
import usePrevious from "../../hooks/usePrevious";
import useGridSnapping from "../../hooks/useGridSnapping";

import { useAuth } from "../../contexts/AuthContext";
import {
  useSetPreventMapInteraction,
  useMapWidth,
  useMapHeight,
  useDebouncedStageScale,
} from "../../contexts/MapInteractionContext";
import { useGridCellPixelSize } from "../../contexts/GridContext";
import { useDataURL } from "../../contexts/AssetsContext";

import TokenStatus from "../token/TokenStatus";
import TokenLabel from "../token/TokenLabel";

import colors from "../../helpers/colors";

import { tokenSources } from "../../tokens";

function MapToken({
  tokenState,
  onTokenStateChange,
  onTokenMenuOpen,
  onTokenDragStart,
  onTokenDragEnd,
  draggable,
  fadeOnHover,
  map,
}) {
  const { userId } = useAuth();

  const stageScale = useDebouncedStageScale();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();
  const setPreventMapInteraction = useSetPreventMapInteraction();

  const gridCellPixelSize = useGridCellPixelSize();

  const tokenURL = useDataURL(tokenState, tokenSources);
  const [tokenImage, tokenImageStatus] = useImage(tokenURL);

  const tokenAspectRatio = tokenState.width / tokenState.height;

  const snapPositionToGrid = useGridSnapping();

  function handleDragStart(event) {
    const tokenGroup = event.target;
    const tokenImage = imageRef.current;

    if (tokenState.category === "vehicle") {
      // Enable hit detection for .intersects() function
      Konva.hitOnDragEnabled = true;

      // Find all other tokens on the map
      const layer = tokenGroup.getLayer();
      const tokens = layer.find(".character");
      for (let other of tokens) {
        if (other === tokenGroup) {
          continue;
        }
        const otherRect = other.getClientRect();
        const otherCenter = {
          x: otherRect.x + otherRect.width / 2,
          y: otherRect.y + otherRect.height / 2,
        };
        if (tokenImage.intersects(otherCenter)) {
          // Save and restore token position after moving layer
          const position = other.absolutePosition();
          other.moveTo(tokenGroup);
          other.absolutePosition(position);
        }
      }
    }

    onTokenDragStart(event);
  }

  function handleDragMove(event) {
    const tokenGroup = event.target;
    // Snap to corners of grid
    if (map.snapToGrid) {
      tokenGroup.position(snapPositionToGrid(tokenGroup.position()));
    }
  }

  function handleDragEnd(event) {
    const tokenGroup = event.target;

    const mountChanges = {};
    if (tokenState.category === "vehicle") {
      Konva.hitOnDragEnabled = false;

      const parent = tokenGroup.getParent();
      const mountedTokens = tokenGroup.find(".character");
      for (let mountedToken of mountedTokens) {
        // Save and restore token position after moving layer
        const position = mountedToken.absolutePosition();
        mountedToken.moveTo(parent);
        mountedToken.absolutePosition(position);
        mountChanges[mountedToken.id()] = {
          x: mountedToken.x() / mapWidth,
          y: mountedToken.y() / mapHeight,
          lastModifiedBy: userId,
          lastModified: Date.now(),
        };
      }
    }

    setPreventMapInteraction(false);
    onTokenStateChange({
      ...mountChanges,
      [tokenState.id]: {
        x: tokenGroup.x() / mapWidth,
        y: tokenGroup.y() / mapHeight,
        lastModifiedBy: userId,
        lastModified: Date.now(),
      },
    });
    onTokenDragEnd(event);
  }

  function handleClick(event) {
    if (draggable) {
      const tokenImage = event.target;
      onTokenMenuOpen(tokenState.id, tokenImage);
    }
  }

  const [tokenOpacity, setTokenOpacity] = useState(1);
  // Store token pointer down time to check for a click when token is locked
  const tokenPointerDownTimeRef = useRef();
  function handlePointerDown(event) {
    if (draggable) {
      setPreventMapInteraction(true);
    }
    if (tokenState.locked && map.owner === userId) {
      tokenPointerDownTimeRef.current = event.evt.timeStamp;
    }
  }

  function handlePointerUp(event) {
    if (draggable) {
      setPreventMapInteraction(false);
    }
    // Check token click when locked and we are the map owner
    // We can't use onClick because that doesn't check pointer distance
    if (tokenState.locked && map.owner === userId) {
      // If down and up time is small trigger a click
      const delta = event.evt.timeStamp - tokenPointerDownTimeRef.current;
      if (delta < 300) {
        const tokenImage = event.target;
        onTokenMenuOpen(tokenState.id, tokenImage);
      }
    }
  }

  function handlePointerEnter() {
    if (fadeOnHover) {
      setTokenOpacity(0.5);
    }
  }

  function handlePointerLeave() {
    if (tokenOpacity !== 1.0) {
      setTokenOpacity(1.0);
    }
  }

  const minCellSize = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );
  const tokenWidth = minCellSize * tokenState.size;
  const tokenHeight = (minCellSize / tokenAspectRatio) * tokenState.size;

  const debouncedStageScale = useDebounce(stageScale, 50);
  const imageRef = useRef();
  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const canvas = image.getCanvas();
    const pixelRatio = canvas.pixelRatio || 1;

    if (
      tokenImageStatus === "loaded" &&
      tokenWidth > 0 &&
      tokenHeight > 0 &&
      tokenImage
    ) {
      const maxImageSize = Math.max(tokenImage.width, tokenImage.height);
      const maxTokenSize = Math.max(tokenWidth, tokenHeight);
      // Constrain image buffer to original image size
      const maxRatio = maxImageSize / maxTokenSize;

      image.cache({
        pixelRatio: Math.min(
          Math.max(debouncedStageScale * pixelRatio, 1),
          maxRatio
        ),
      });
      image.drawHitFromCache();
    }
  }, [
    debouncedStageScale,
    tokenWidth,
    tokenHeight,
    tokenImageStatus,
    tokenImage,
  ]);

  // Animate to new token positions if edited by others
  const tokenX = tokenState.x * mapWidth;
  const tokenY = tokenState.y * mapHeight;
  const previousWidth = usePrevious(mapWidth);
  const previousHeight = usePrevious(mapHeight);
  const resized = mapWidth !== previousWidth || mapHeight !== previousHeight;
  const skipAnimation = tokenState.lastModifiedBy === userId || resized;
  const props = useSpring({
    x: tokenX,
    y: tokenY,
    immediate: skipAnimation,
  });

  // When a token is hidden if you aren't the map owner hide it completely
  if (map && !tokenState.visible && map.owner !== userId) {
    return null;
  }

  // Token name is used by on click to find whether a token is a vehicle or prop
  let tokenName = "";
  if (tokenState) {
    tokenName = tokenState.category;
  }
  if (tokenState && tokenState.locked) {
    tokenName = tokenName + "-locked";
  }

  let outline = tokenState.outline;
  if (Array.isArray(tokenState.outline)) {
    outline = [...outline]; // Copy array so we can edit it imutably
    for (let i = 0; i < outline.length; i += 2) {
      // Scale outline to the token
      outline[i] = (outline[i] / tokenState.width) * tokenWidth;
      outline[i + 1] = (outline[i + 1] / tokenState.height) * tokenHeight;
    }
  }

  function renderOutline() {
    const sharedProps = {
      fill: colors.black,
      width: tokenWidth,
      height: tokenHeight,
      x: 0,
      y: 0,
      rotation: tokenState.rotation,
      offsetX: tokenWidth / 2,
      offsetY: tokenHeight / 2,
      opacity: 0.8,
    };
    if (outline === "rect") {
      return <Rect {...sharedProps} />;
    } else if (outline === "circle") {
      return <Circle {...sharedProps} offsetX={0} offsetY={0} />;
    } else {
      return <Line {...sharedProps} points={outline} closed tension={0.33} />;
    }
  }

  return (
    <animated.Group
      {...props}
      width={tokenWidth}
      height={tokenHeight}
      draggable={draggable}
      onMouseDown={handlePointerDown}
      onMouseUp={handlePointerUp}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onTouchStart={handlePointerDown}
      onTouchEnd={handlePointerUp}
      onClick={handleClick}
      onTap={handleClick}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      opacity={tokenState.visible ? tokenOpacity : 0.5}
      name={tokenName}
      id={tokenState.id}
    >
      {!tokenImage ? (
        renderOutline()
      ) : (
        <KonvaImage
          ref={imageRef}
          width={tokenWidth}
          height={tokenHeight}
          x={0}
          y={0}
          image={tokenImage}
          rotation={tokenState.rotation}
          offsetX={tokenWidth / 2}
          offsetY={tokenHeight / 2}
        />
      )}
      <Group offsetX={tokenWidth / 2} offsetY={tokenHeight / 2}>
        <TokenStatus
          tokenState={tokenState}
          width={tokenWidth}
          height={tokenHeight}
        />
        <TokenLabel
          tokenState={tokenState}
          width={tokenWidth}
          height={tokenHeight}
        />
      </Group>
    </animated.Group>
  );
}

export default MapToken;
