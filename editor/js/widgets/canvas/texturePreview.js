
//This widget allows to preview a texture in the canvas
function TexturePreviewWidget()
{
	this._ctor();
	this.border = true;
	this.draggable = true;
	this.resizable = true;
	this.closable = true;
	this.texture_name = "";
	this.position = [40,40];
	this.size = [250,200];

	this.channel = "all";
}

TexturePreviewWidget.title = "Texture Preview";

TexturePreviewWidget.prototype.onClose = function()
{
}

TexturePreviewWidget.prototype.onRender = function( ctx, viewport )
{
	var texture = LS.ResourcesManager.textures[ this.texture_name ];
	if(!texture)
		texture = GL.Texture.getBlackTexture();

	var old = gl.getViewport();
	gl.setViewport( viewport, true );

	texture.toViewport();

	gl.setViewport( old );//restore
}

TexturePreviewWidget.prototype.onEvent = function(e)
{
	if(e.type == "mousemove")
		return;

	if(e.type == "mousedown" && e.rightButton && this.isEventInside(e))
	{
		this.showContextMenu( e );
		return true;
	}
	if(e.type == "mouseup" && e.button == 2 && this.isEventInside(e))
		return true;
}

TexturePreviewWidget.prototype.showContextMenu = function( e )
{
	var that = this;

	var options = [
		"inspect",
		null,
		"close"
	];

	var menu = new LiteGUI.ContextMenu( options, {  event: e, title: "TexturePreview", callback: function( action, o, e ) {
		if(action == "inspect")
			EditorModule.inspect( that );
		else if(action == "close")
			that.close();
	}});
}

TexturePreviewWidget.prototype.inspect = function( inspector )
{
	var that = this;

	inspector.clear();
	inspector.addTexture("Texture", this.texture_name, { callback: function(v){
		that.texture_name = v;
	}});

	inspector.addCombo("Channels", this.channel, { values: ["all","red","green","blue","alpha"], callback: function(v){
		that.channel = v;
	}});
}

LS.extendClass( TexturePreviewWidget, CanvasElement );

EditorModule.registerCanvasWidget( TexturePreviewWidget );

