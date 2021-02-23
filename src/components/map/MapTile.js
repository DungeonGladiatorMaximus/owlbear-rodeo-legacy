import React from "react";

import Tile from "../Tile";

import useDataSource from "../../hooks/useDataSource";
import { mapSources as defaultMapSources, unknownSource } from "../../maps";

function MapTile({
  map,
  isSelected,
  onMapSelect,
  onMapEdit,
  onDone,
  size,
  canEdit,
  badges,
}) {
  const isDefault = map.type === "default";
  const mapSource = useDataSource(
    isDefault ? map : map.thumbnail,
    defaultMapSources,
    unknownSource
  );

  return (
    <Tile
      src={mapSource}
      title={map.name}
      isSelected={isSelected}
      onSelect={() => onMapSelect(map)}
      onEdit={() => onMapEdit(map.id)}
      onDoubleClick={onDone}
      size={size}
      canEdit={canEdit}
      badges={badges}
      editTitle="Edit Map"
    />
  );
}

export default MapTile;
