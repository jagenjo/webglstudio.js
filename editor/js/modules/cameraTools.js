//************* TOOLS *******************



function CameraPreviewWidget( camera )
{
	this._ctor();
	this.border = true;
	this.draggable = true;
	this.resizable = true;
	this.closable = true;
	this.camera = camera;
	this.position = [40,40];
	this.size = [250,200];

	if(this.camera)
		this.camera._preview_widget = this;
}

CameraPreviewWidget.prototype.onClose = function()
{
	if(this.camera)
		this.camera._preview_widget = null;
}

CameraPreviewWidget.prototype.onRender = function( ctx, viewport )
{
	if(!this.camera)
		return;

	var old = gl.getViewport();
	gl.setViewport( viewport, true );

	var render_settings = RenderModule.render_settings;

	this.camera.final_aspect = viewport[2] / viewport[3];
	LS.Renderer.clearBuffer( this.camera, render_settings );
	LS.Renderer.enableCamera( this.camera, render_settings, true );
	LS.Renderer.renderInstances( render_settings );
	gl.setViewport( old );//restore

	//restore flags
	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	gl.enable( gl.BLEND );
	gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
}

CameraPreviewWidget.prototype.onEvent = function(e)
{
	if(e.type == "mousemove")
		return;

	if(e.type == "mousedown" && e.rightButton && this.isEventInside(e))
	{
		EditorModule.showComponentContextMenu( this.camera, e );
		return true;
	}
	if(e.type == "mouseup" && e.button == 2 && this.isEventInside(e))
		return true;
}

LS.extendClass( CameraPreviewWidget, CanvasElement );



