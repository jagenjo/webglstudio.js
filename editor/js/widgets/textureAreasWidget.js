function TextureAreasWidget( options )
{
	this.root = null;
	this.createInterface( options );
}

TextureAreasWidget.widget_name = "Texture Areas";

TextureAreasWidget.createDialog = function( parent, component )
{
	var dialog = new LiteGUI.Dialog( null, { title: TextureAreasWidget.widget_name, fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, parent: parent, width: 800, height: 500 });
	var widget = new TextureAreasWidget();
	dialog.add( widget );
	dialog.widget = widget;
	dialog.on_resize = function()
	{
		widget.onResize();
	}
	widget.onResize()
	return dialog;
}

TextureAreasWidget.prototype.createInterface = function()
{
	this.root = document.createElement("div");
	this.root.style.width = "100%";
	this.root.style.height = "100%";
	this.canvas = createCanvas(100,100);
	this.root.appendChild( this.canvas );
	
	this.render();
}

TextureAreasWidget.prototype.render = function()
{
	var rect = LiteGUI.getRect( this.canvas.parentNode );
	if(!rect)
		return;

	if(this.canvas.width != rect.width )
		this.canvas.width = rect.width;
	if(this.canvas.height != rect.height )
		this.canvas.height = rect.height;

	var ctx = this.canvas.getContext("2d");
	ctx.fillStyle = "red";
	ctx.fillRect( 0,0, this.canvas.width, this.canvas.height );
}

TextureAreasWidget.prototype.onResize = function()
{
	this.render();
}