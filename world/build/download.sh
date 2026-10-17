#!/bin/sh
# Download every source for the Bloor section world into <raw_dir> (about 250 MB unzipped).
# Raw files stay outside the repo; only the built world JSON is committed.
set -eu
RAW=${1:?usage: download.sh <raw_dir>}
mkdir -p "$RAW" && cd "$RAW"
CK=https://ckan0.cf.opendata.inter.prod-toronto.ca
DS=$CK/dataset
BOX='43.6630,-79.4130,43.6695,-79.4020'
UA='counterfactual-lab-hackathon/0.1'

curl -sfL -o pednet.geojson   "$DS/4b5c7a84-dea1-4137-875d-71d7f662c83f/resource/33835def-35f2-4705-a348-b7983e8e66a1/download/pedestrian-network-data-4326.geojson"
curl -sfL -o signals.geojson  "$DS/1a106e88-f734-4179-b3fe-d690a6187a71/resource/e331c953-7e49-418b-9eab-594881c76f33/download/traffic-signal-4326.geojson"
curl -sfL -o timing.zip       "$DS/7dda2235-999e-4a17-b228-abd0961e045d/resource/02c90a3a-d754-4023-a283-ed5687e87f1f/download/traffic-signals-timing.zip"
curl -sfL -o cycling.geojson  "$DS/abbe5ee3-e249-4f86-a219-f0022eaddcc9/resource/023da9a2-8848-4e10-9cad-e7f9119cd874/download/cycling-network-4326.geojson"
curl -sfL -o nbhd.geojson     "$DS/fc443770-ef0a-4025-9c2c-2cb558bfab00/resource/0719053b-28b7-48ea-b863-068823a93aaa/download/neighbourhoods-4326.geojson"
curl -sfL -o massing2025.zip  "$DS/387b2e3b-2a76-4199-8b3b-0b7d22e2ec10/resource/667237d6-4d3c-4cf3-8cb7-e91c48d59375/download/3dmassingshapefile_2025_wgs84.zip"
curl -sfL -o gtfs.zip         "$DS/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip"
for px in 281 321 2083; do
  curl -sf -o "tmc_px$px.json" "$CK/api/3/action/datastore_search?resource_id=262469c2-abfe-4756-9068-4ea5c7ba1af7&limit=2000&filters=%7B%22px%22%3A$px%7D"
done
unzip -o -q timing.zip -d timing
unzip -o -q massing2025.zip -d massing
unzip -o -q gtfs.zip -d gtfs

overpass() { curl -sf -A "$UA" --data-urlencode "data=$1" https://overpass-api.de/api/interpreter -o "$2"; }
overpass "[out:json][timeout:60];(nwr[\"shop\"]($BOX);nwr[\"amenity\"]($BOX);nwr[\"office\"]($BOX);nwr[\"railway\"=\"subway_entrance\"]($BOX););out center tags;" osm.json
overpass "[out:json][timeout:60];(way[\"building\"]($BOX);relation[\"building\"]($BOX););out center tags;" osm_buildings.json
overpass "[out:json][timeout:60];way[\"highway\"]($BOX);out body geom;" osm_highways.json
echo "downloaded to $RAW"
