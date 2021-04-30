// eslint-disable-next-line no-unused-vars
import Dexie, { Version, DexieOptions } from "dexie";
import "dexie-observable";
import shortid from "shortid";
import { v4 as uuid } from "uuid";
import Case from "case";

import blobToBuffer from "./helpers/blobToBuffer";
import { getGridDefaultInset } from "./helpers/grid";
import { convertOldActionsToShapes } from "./actions";
import { createThumbnail } from "./helpers/image";

// Helper to create a thumbnail for a file in a db
async function createDataThumbnail(data) {
  let url;
  if (data?.resolutions?.low?.file) {
    url = URL.createObjectURL(new Blob([data.resolutions.low.file]));
  } else {
    url = URL.createObjectURL(new Blob([data.file]));
  }
  return await Dexie.waitFor(
    new Promise((resolve) => {
      let image = new Image();
      image.onload = async () => {
        const thumbnail = await createThumbnail(image);
        resolve(thumbnail);
      };
      image.src = url;
    }),
    60000 * 10 // 10 minute timeout
  );
}

/**
 * @callback VersionCallback
 * @param {Version} version
 */

/**
 * Mapping of version number to their upgrade function
 * @type {Object.<number, VersionCallback>}
 */
const versions = {
  // v1.2.0
  1(v) {
    v.stores({
      maps: "id, owner",
      states: "mapId",
      tokens: "id, owner",
      user: "key",
    });
  },
  // v1.2.1 - Move from blob files to array buffers
  2(v) {
    v.stores({}).upgrade(async (tx) => {
      const maps = await Dexie.waitFor(tx.table("maps").toArray());
      let mapBuffers = {};
      for (let map of maps) {
        mapBuffers[map.id] = await Dexie.waitFor(blobToBuffer(map.file));
      }
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.file = mapBuffers[map.id];
        });
    });
  },
  // v1.3.0 - Added new default tokens
  3(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          function mapTokenId(id) {
            switch (id) {
              case "__default-Axes":
                return "__default-Barbarian";
              case "__default-Bird":
                return "__default-Druid";
              case "__default-Book":
                return "__default-Wizard";
              case "__default-Crown":
                return "__default-Humanoid";
              case "__default-Dragon":
                return "__default-Dragon";
              case "__default-Eye":
                return "__default-Warlock";
              case "__default-Fist":
                return "__default-Monk";
              case "__default-Horse":
                return "__default-Fey";
              case "__default-Leaf":
                return "__default-Druid";
              case "__default-Lion":
                return "__default-Monstrosity";
              case "__default-Money":
                return "__default-Humanoid";
              case "__default-Moon":
                return "__default-Cleric";
              case "__default-Potion":
                return "__default-Sorcerer";
              case "__default-Shield":
                return "__default-Paladin";
              case "__default-Skull":
                return "__default-Undead";
              case "__default-Snake":
                return "__default-Beast";
              case "__default-Sun":
                return "__default-Cleric";
              case "__default-Swords":
                return "__default-Fighter";
              case "__default-Tree":
                return "__default-Plant";
              case "__default-Triangle":
                return "__default-Sorcerer";
              default:
                return "__default-Fighter";
            }
          }
          for (let stateId in state.tokens) {
            state.tokens[stateId].tokenId = mapTokenId(
              state.tokens[stateId].tokenId
            );
            state.tokens[stateId].lastEditedBy = "";
            state.tokens[stateId].rotation = 0;
          }
        });
    });
  },
  // v1.3.1 - Added show grid option
  4(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.showGrid = false;
        });
    });
  },
  // v1.4.0 - Added fog subtraction
  5(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let fogAction of state.fogDrawActions) {
            if (fogAction.type === "add" || fogAction.type === "edit") {
              for (let shape of fogAction.shapes) {
                shape.data.holes = [];
              }
            }
          }
        });
    });
  },
  // v1.4.2 - Added map resolutions
  6(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.resolutions = {};
          map.quality = "original";
        });
    });
  },
  // v1.5.0 - Fixed default token rogue spelling
  7(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let id in state.tokens) {
            if (state.tokens[id].tokenId === "__default-Rouge") {
              state.tokens[id].tokenId = "__default-Rogue";
            }
          }
        });
    });
  },
  // v1.5.0 - Added map snap to grid option
  8(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.snapToGrid = true;
        });
    });
  },
  // v1.5.1 - Added lock, visibility and modified to tokens
  9(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let id in state.tokens) {
            state.tokens[id].lastModifiedBy = state.tokens[id].lastEditedBy;
            delete state.tokens[id].lastEditedBy;
            state.tokens[id].lastModified = Date.now();
            state.tokens[id].locked = false;
            state.tokens[id].visible = true;
          }
        });
    });
  },
  // v1.5.1 - Added token prop category and remove isVehicle bool
  10(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("tokens")
        .toCollection()
        .modify((token) => {
          token.category = token.isVehicle ? "vehicle" : "character";
          delete token.isVehicle;
        });
    });
  },
  // v1.5.2 - Added automatic cache invalidation to maps
  11(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.lastUsed = map.lastModified;
        });
    });
  },
  // v1.5.2 - Added automatic cache invalidation to tokens
  12(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("tokens")
        .toCollection()
        .modify((token) => {
          token.lastUsed = token.lastModified;
        });
    });
  },
  // v1.6.0 - Added map grouping and grid scale and offset
  13(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.group = "";
          map.grid = {
            size: { x: map.gridX, y: map.gridY },
            inset: getGridDefaultInset(
              { size: { x: map.gridX, y: map.gridY }, type: "square" },
              map.width,
              map.height
            ),
            type: "square",
          };
          delete map.gridX;
          delete map.gridY;
          delete map.gridType;
        });
    });
  },
  // v1.6.0 - Added token grouping
  14(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("tokens")
        .toCollection()
        .modify((token) => {
          token.group = "";
        });
    });
  },
  // v1.6.1 - Added width and height to tokens
  15(v) {
    v.stores({}).upgrade(async (tx) => {
      const tokens = await Dexie.waitFor(tx.table("tokens").toArray());
      let tokenSizes = {};
      for (let token of tokens) {
        const url = URL.createObjectURL(new Blob([token.file]));
        let image = new Image();
        tokenSizes[token.id] = await Dexie.waitFor(
          new Promise((resolve) => {
            image.onload = () => {
              resolve({ width: image.width, height: image.height });
            };
            image.src = url;
          })
        );
      }
      return tx
        .table("tokens")
        .toCollection()
        .modify((token) => {
          token.width = tokenSizes[token.id].width;
          token.height = tokenSizes[token.id].height;
        });
    });
  },
  // v1.7.0 - Added note tool
  16(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          state.notes = {};
          state.editFlags = [...state.editFlags, "notes"];
        });
    });
  },
  // 1.7.0 (hotfix) - Optimized fog shape edits to only include needed data
  17(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let i = 0; i < state.fogDrawActions.length; i++) {
            const action = state.fogDrawActions[i];
            if (action && action.type === "edit") {
              for (let j = 0; j < action.shapes.length; j++) {
                const shape = action.shapes[j];
                const temp = { ...shape };
                state.fogDrawActions[i].shapes[j] = {
                  id: temp.id,
                  visible: temp.visible,
                };
              }
            }
          }
        });
    });
  },
  // 1.8.0 - Added note text only mode, converted draw and fog representations
  18(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let id in state.notes) {
            state.notes[id].textOnly = false;
          }

          state.drawShapes = convertOldActionsToShapes(
            state.mapDrawActions,
            state.mapDrawActionIndex
          );
          state.fogShapes = convertOldActionsToShapes(
            state.fogDrawActions,
            state.fogDrawActionIndex
          );

          delete state.mapDrawActions;
          delete state.mapDrawActionIndex;
          delete state.fogDrawActions;
          delete state.fogDrawActionIndex;
        });
    });
  },
  // 1.8.0 - Add thumbnail to maps and add measurement to grid
  19(v) {
    v.stores({}).upgrade(async (tx) => {
      const userId = (await Dexie.waitFor(tx.table("user").get("userId")))
        .value;
      const maps = await Dexie.waitFor(tx.table("maps").toArray());
      const thumbnails = {};
      for (let map of maps) {
        try {
          if (map.owner === userId) {
            thumbnails[map.id] = await createDataThumbnail(map);
          }
        } catch {}
      }
      return tx
        .table("maps")
        .toCollection()
        .modify((map) => {
          map.thumbnail = thumbnails[map.id];
          map.grid.measurement = { type: "chebyshev", scale: "5ft" };
        });
    });
  },
  // 1.8.0 - Add thumbnail to tokens
  20(v) {
    v.stores({}).upgrade(async (tx) => {
      const userId = (await Dexie.waitFor(tx.table("user").get("userId")))
        .value;
      const tokens = await Dexie.waitFor(tx.table("tokens").toArray());
      const thumbnails = {};
      for (let token of tokens) {
        try {
          if (token.owner === userId) {
            thumbnails[token.id] = await createDataThumbnail(token);
          }
        } catch {}
      }
      return tx
        .table("tokens")
        .toCollection()
        .modify((token) => {
          token.thumbnail = thumbnails[token.id];
        });
    });
  },
  // 1.8.0 - Upgrade for Dexie.Observable
  21(v) {
    v.stores({});
  },
  // v1.8.1 - Shorten fog shape ids
  22(v) {
    v.stores({}).upgrade((tx) => {
      return tx
        .table("states")
        .toCollection()
        .modify((state) => {
          for (let id of Object.keys(state.fogShapes)) {
            const newId = shortid.generate();
            state.fogShapes[newId] = state.fogShapes[id];
            state.fogShapes[newId].id = newId;
            delete state.fogShapes[id];
          }
        });
    });
  },
  // v1.9.0 - Move map assets into new table
  23(v) {
    v.stores({ assets: "id, owner" }).upgrade((tx) => {
      tx.table("maps").each((map) => {
        let assets = [];
        assets.push({
          id: uuid(),
          file: map.file,
          width: map.width,
          height: map.height,
          mime: "",
          prevId: map.id,
          prevType: "map",
        });

        for (let resolution in map.resolutions) {
          const mapRes = map.resolutions[resolution];
          assets.push({
            id: uuid(),
            file: mapRes.file,
            width: mapRes.width,
            height: mapRes.height,
            mime: "",
            prevId: map.id,
            prevType: "mapResolution",
            resolution,
          });
        }

        assets.push({
          id: uuid(),
          file: map.thumbnail.file,
          width: map.thumbnail.width,
          height: map.thumbnail.height,
          mime: "",
          prevId: map.id,
          prevType: "mapThumbnail",
        });

        tx.table("assets").bulkAdd(assets);
      });
    });
  },
  // v1.9.0 - Move token assets into new table
  24(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("tokens").each((token) => {
        let assets = [];
        assets.push({
          id: uuid(),
          file: token.file,
          width: token.width,
          height: token.height,
          mime: "",
          prevId: token.id,
          prevType: "token",
        });
        assets.push({
          id: uuid(),
          file: token.thumbnail.file,
          width: token.thumbnail.width,
          height: token.thumbnail.height,
          mime: "",
          prevId: token.id,
          prevType: "tokenThumbnail",
        });
        tx.table("assets").bulkAdd(assets);
      });
    });
  },
  // v1.9.0 - Create foreign keys for assets
  25(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("assets").each((asset) => {
        if (asset.prevType === "map") {
          tx.table("maps").update(asset.prevId, {
            file: asset.id,
          });
        } else if (asset.prevType === "token") {
          tx.table("tokens").update(asset.prevId, {
            file: asset.id,
          });
        } else if (asset.prevType === "mapThumbnail") {
          tx.table("maps").update(asset.prevId, { thumbnail: asset.id });
        } else if (asset.prevType === "tokenThumbnail") {
          tx.table("tokens").update(asset.prevId, { thumbnail: asset.id });
        } else if (asset.prevType === "mapResolution") {
          tx.table("maps").update(asset.prevId, {
            resolutions: undefined,
            [asset.resolution]: asset.id,
          });
        }
      });
    });
  },
  // v1.9.0 - Remove asset migration helpers
  26(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("assets")
        .toCollection()
        .modify((asset) => {
          delete asset.prevId;
          if (asset.prevType === "mapResolution") {
            delete asset.resolution;
          }
          delete asset.prevType;
        });
    });
  },
  // v1.9.0 - Remap map resolution assets
  27(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("maps")
        .toCollection()
        .modify((map) => {
          const resolutions = ["low", "medium", "high", "ultra"];
          map.resolutions = {};
          for (let res of resolutions) {
            if (res in map) {
              map.resolutions[res] = map[res];
              delete map[res];
            }
          }
          delete map.lastUsed;
        });
    });
  },
  // v1.9.0 - Move tokens to use more defaults and add token outline to tokens
  28(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("tokens")
        .toCollection()
        .modify(async (token) => {
          token.defaultCategory = token.category;
          delete token.category;
          token.defaultLabel = "";
          if (token.width === token.height) {
            token.outline = "circle";
          } else {
            token.outline = "rect";
          }
          delete token.lastUsed;
        });
    });
  },
  // v1.9.0 - Move tokens to use more defaults and add token outline to token states
  29(v) {
    v.stores({}).upgrade((tx) => {
      tx.table("states")
        .toCollection()
        .modify(async (state) => {
          for (let tokenState of Object.values(state.tokens)) {
            if (!tokenState.tokenId.startsWith("__default")) {
              const token = await tx.table("tokens").get(tokenState.tokenId);
              if (token) {
                tokenState.category = token.defaultCategory;
                tokenState.file = token.file;
                tokenState.type = "file";
                tokenState.outline = token.outline;
                tokenState.width = token.width;
                tokenState.height = token.height;
              } else {
                tokenState.category = "character";
                tokenState.type = "file";
                tokenState.file = "";
                tokenState.outline = "rect";
                tokenState.width = 256;
                tokenState.height = 256;
              }
            } else {
              tokenState.category = "character";
              tokenState.type = "default";
              tokenState.key = Case.camel(tokenState.tokenId.slice(10));
              tokenState.outline = "circle";
              tokenState.width = 256;
              tokenState.height = 256;
            }
          }
        });
    });
  },
  // v1.9.0 - Remove maps not owned by user as cache is now done on the asset level
  30(v) {
    v.stores({}).upgrade(async (tx) => {
      const userId = (await tx.table("user").get("userId")).value;
      tx.table("maps").where("owner").notEqual(userId).delete();
    });
  },
  // v1.9.0 - Remove tokens not owned by user as cache is now done on the asset level
  31(v) {
    v.stores({}).upgrade(async (tx) => {
      const userId = (await tx.table("user").get("userId")).value;
      tx.table("tokens").where("owner").notEqual(userId).delete();
    });
  },
};

const latestVersion = 29;

/**
 * Load versions onto a database up to a specific version number
 * @param {Dexie} db
 * @param {number=} upTo version number to load up to, latest version if undefined
 */
export function loadVersions(db, upTo = latestVersion) {
  for (let versionNumber = 1; versionNumber <= upTo; versionNumber++) {
    versions[versionNumber](db.version(versionNumber));
  }
}

/**
 * Get a Dexie database with a name and versions applied
 * @param {DexieOptions} options
 * @param {string=} name
 * @param {number=} versionNumber
 * @returns {Dexie}
 */
export function getDatabase(
  options,
  name = "OwlbearRodeoDB",
  versionNumber = latestVersion
) {
  let db = new Dexie(name, options);
  loadVersions(db, versionNumber);
  return db;
}
