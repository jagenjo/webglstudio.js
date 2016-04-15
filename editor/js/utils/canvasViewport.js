/* holds information about how to represent some info inside the 3D Canvas */
function CanvasViewport()
{
	this.viewport_normalized = vec4.fromValues(0,0,1,1);
	this._viewport = vec4.create();
	this.camera = null;
	this.gizmos = [];
	this.render_settings = null;
}

//TODO