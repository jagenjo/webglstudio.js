cd "$(dirname "$0")"
echo "LITEGL"
../../litegl/utils/pack.sh
cp -v ../../litegl/build/* ../editor/js/extra
echo "LITESCENE"
../../litescene/utils/pack.sh
cp -v ../../litescene/build/* ../editor/js/extra
echo "LITEGUI"
../../litegui/utils/pack.sh
cp -v ../../litegui/build/*.js ../editor/js/extra
cp -v ../../litegui/build/*.css ../editor/css
echo "LITEGRAPH"
../../litegraph/utils/pack.sh
cp -v ../../litegraph/build/* ../editor/js/extra
cp -v ../../litegraph/css/*.css ../editor/css
echo "LITEFILESERVER"
cp -v ../../litefileserver/src/litefileserver.js ../editor/js/extra
echo "WEBGLTOCANVAS2D"
cp -v ../../canvas2DtoWebGL/src/Canvas2DtoWebGL.js ../editor/js/extra

