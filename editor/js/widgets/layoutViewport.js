/*
	Every area of the viewport where we render the scene in the editor.
	Helps to control the cameras and render settings for every viewport.
	All the Layouts are stored in RenderModule
*/
function LayoutViewport( options )
{
	options = options || {};

	//normalized: viewport origin 0,0 is in the lower-left corner
	this._viewport = vec4.fromValues(0,0,1,1);
	this._viewport_in_pixels = vec4.fromValues(0,0,100,100);

	if( options.viewport )
		this._viewport.set( options.viewport );

	this.name = "perspective";
	this.render_settings = null;

	var camera_settings = { 
		uid: LS.generateUId("CAM"),
		eye:[50,100,100],
		center: LS.ZEROS, 
		near:0.1,
		far:10000,
		layers: 0xFF,
		viewport: this._viewport
		//use_fixed_viewport: false,
		//fixed_viewport: vec2.fromValues(800,600),
	};

	if( options.camera )
		for(var i in options.camera )
			camera_settings[i] = options.camera[i];

	//two cameras possible, one from the scene or a regular editor camera
	this.editor_camera = new LS.Camera(camera_settings);
	this.scene_camera = null;
	this.scene_camera_original_viewport = vec4.create();
	this.camera = this.editor_camera;

	//for smoothing
	this.destination_eye = vec3.clone( this.camera.eye ),
	this.destination_center = vec3.clone( this.camera.center ),

	this.gizmos = [];
	this.buttons = [];

	this._over_corner = false;

	//add gizmos
	this.addGizmos();
}

LayoutViewport.temp_vec4 = vec4.create();

//called from CanvasManager
LayoutViewport.prototype.render = function()
{
	//called after rendering the scene
	var camera = this.camera;
	var viewport = camera.getLocalViewport( null, this._viewport_in_pixels );

	/*
	if(this.use_fixed_viewport)
	{
		var w = this.fixed_viewport[0];
		var h = this.fixed_viewport[1];
		if( this.fixed_viewport[0] > this.fixed_viewport[1] ) //width is bigger
		{
			if( this.fixed_viewport[0] > gl.drawingBufferWidth )
			{
				h = h * ( w / gl.drawingBufferWidth );
				w = gl.drawingBufferWidth;
			}
		}
		else
		{
			if( this.fixed_viewport[1] > gl.drawingBufferHeight )
			{
				w = w * ( h / gl.drawingBufferHeight );
				w = gl.drawingBufferHeight;
			}
		}
	}
	*/

	//render outline 
	gl.start2D();
	gl.strokeColor = this == RenderModule.active_viewport ? [0.75,0.75,0.75] : [0.5,0.5,0.5];
	gl.strokeRect( viewport[0], gl.canvas.height - viewport[3] - viewport[1],viewport[2] - 2,viewport[3] - 2);

	//render corner button
	gl.globalAlpha = !this._over_corner ? 0.5 : 1.0;
	gl.save();
	gl.translate( viewport[0], gl.canvas.height - viewport[3] - viewport[1] );
	gl.strokeRect( viewport[2] - 121, 2, 120, 14 );
	gl.fillStyle = this._over_corner ? "white" : "black";
	gl.fillRect( viewport[2] - 121, 1, 120, 14 );
	gl.font = "14px Arial";
	gl.globalAlpha = !this._over_corner ? 0.75 : 1.0;
	gl.fillStyle = !this._over_corner ? "white" : "black";
	gl.fillText( this.index + ": " + this.name, viewport[2] - 100, 13 );
	gl.globalAlpha = 1;
	gl.restore();
	gl.finish2D();

	//render gizmos
	for(var i in this.gizmos)
	{
		var gizmo = this.gizmos[i];
		if(gizmo.render)
			gizmo.render();
	}
}

Object.defineProperty( LayoutViewport.prototype, "viewport", {
	set: function(v){
		if(!v)
			return;
		this._viewport.set( v );
		this.camera._viewport.set(v);
	},
	get: function()
	{
		return this._viewport;
	},
	enumerable: true
});

Object.defineProperty( LayoutViewport.prototype, "viewport_pixels", {
	set: function(v){
		this._viewport[0] = v[0] / gl.canvas.width;
		this._viewport[1] = v[1] / gl.canvas.height;
		this._viewport[2] = v[2] / gl.canvas.width;
		this._viewport[3] = v[3] / gl.canvas.height;
	},
	get: function(){
		return this._viewport_in_pixels;
	}
});


Object.defineProperty( LayoutViewport.prototype, "width", {
	set: function(v){
		this._viewport[2] = v / gl.canvas.width;
	},
	get: function(){
		return this._viewport_in_pixels[2];
	}
});

LayoutViewport.prototype.update = function(dt)
{
	//render gizmos
	for(var i in this.gizmos)
	{
		var gizmo = this.gizmos[i];
		if(gizmo.update)
			gizmo.update(dt);
	}
}

LayoutViewport.prototype.onMouseDown = function(e)
{
	e.viewportx = e.canvasx - this._viewport_in_pixels[0];
	e.viewporty = this._viewport_in_pixels[3] - (e.canvasy - this._viewport_in_pixels[1]);

	if( this.isInsideRectangle( e.viewportx, e.viewporty, this.width - 100,0,100,20) )
	{
		this._over_corner = false; //to flash
		console.log("show inspector for layout " + this.index);
		EditorModule.inspect( this );
		LS.GlobalScene.requestFrame();
		return true;
	}
}

LayoutViewport.prototype.onMouseMove = function(e)
{
	e.viewportx = e.canvasx - this._viewport_in_pixels[0];
	e.viewporty = this._viewport_in_pixels[3] - (e.canvasy - this._viewport_in_pixels[1]);

	var prev = this._over_corner;
	var over = this.isInsideRectangle( e.viewportx, e.viewporty, this.width - 100,0,100,20);
	gl.canvas.style.cursor = over ? "pointer" : "";

	this._over_corner = over;

	if(prev != over)
		LS.GlobalScene.requestFrame();

	if(over)
		return true;
}

LayoutViewport.prototype.onMouseLeave = function(e)
{
	this._over_corner = false;
}

LayoutViewport.prototype.getCamera = function()
{
	return this.scene_camera || this.editor_camera;
}

LayoutViewport.prototype.isInsideRectangle = function( x, y, rect_x, rect_y, w, h )
{
	return (x > rect_x && x < (rect_x + w) && y > rect_y && y < (rect_y + h));
}

LayoutViewport.prototype.addGizmos = function()
{
	this.gizmos.push( new CameraGizmo( this ) );
}

LayoutViewport.prototype.setCamera = function(camera)
{
	//restore old scene camera viewport
	if(this.scene_camera)
		this.scene_camera._viewport.set( this.scene_camera_original_viewport );

	if(!camera)
	{
		this.scene_camera = null;
		this.camera = this.editor_camera;
		this.name = this.editor_camera.type === LS.Camera.PERSPECTIVE ? "perspective" : "orthographic";
		return;
	}

	if(camera._root) //scene camera
	{
		//cannot have two viewports with the same camera
		for(var i in RenderModule.viewports)
			if( RenderModule.viewports[i].scene_camera == camera )
				RenderModule.viewports[i].setCamera( null );

		this.scene_camera = camera;
		this.scene_camera_original_viewport.set( camera._viewport );
		this.scene_camera._viewport.set( this._viewport );
		this.name = camera._root.name;
		this.camera = this.scene_camera;
	}
	else
	{
		this.name = this.editor_camera.type === LS.Camera.PERSPECTIVE ? "perspective" : "orthographic";
		this.scene_camera = null;
		this.editor_camera.configure( camera.serialize() );
		this.camera = this.editor_camera;
	}
}

LayoutViewport.prototype.copyFromLayout = function( layout )
{
	//do not copy the viewport

	//copy camera info
	var camera = this.editor_camera;
	camera._eye.set( layout.editor_camera._eye );
	camera._center.set( layout.editor_camera._center );
	camera._up.set( layout.editor_camera._up );
	camera.updateMatrices(true);
	this.destination_eye = vec3.clone( camera.eye ),
	this.destination_center = vec3.clone( camera.center ),

	this.render_settings = layout.render_settings;
}

LayoutViewport.prototype.isPointInViewport = function(x,y)
{
	//return this.camera.isPointInCamera( x,y );
	if(x === undefined || y === undefined )
		throw("undefined in LayoutViewport.prototype.isPointInViewport");

	//normalize
	x /= gl.canvas.width;
	y /= gl.canvas.height;
	var v = this._viewport;
	if( x < v[0] || x > v[0] + v[2] ||
		y < v[1] || y > v[1] + v[3] )
		return false;
	return true;
}

LayoutViewport.prototype.serialize = function()
{
	return {
		name: this.name,
		viewport: vec4.toArray( this.viewport ),
		render_settings: this.render_settings ? this.render_settings.serialize() : null,
		editor_camera: this.editor_camera.serialize(),
		scene_camera: this.scene_camera ? this.scene_camera.uid : null
	};
}

LayoutViewport.prototype.configure = function( o )
{
	this.name = o.name;
	this.viewport.set( o.viewport );
	if(o.render_settings)
		this.render_settings = new LS.RenderSettings( o.render_settings );
	this.editor_camera.configure( o.editor_camera );
	if( o.scene_camera )
	{
		var camera = LS.GlobalScene.findComponentByUId( o.scene_camera );
		if( camera )
			this.setCamera( camera );
	}
	else
		this.camera = this.editor_camera;
}

LayoutViewport.prototype.showContextMenu = function( e, prev_menu )
{
	var that = this;

	var options = [
		"Camera Info",
		"Render Settings",
		null,
		"Perspective",
		"Orthographic",
		null,
		{ title: "Select Camera", has_submenu: true, callback: inner_cameras }
	];

	var menu = new LiteGUI.ContextMenu( options, { event: e, title: "View " + this.index, parentMenu: prev_menu, callback: function(v) { 

		switch( v )
		{
			case "Camera Info": EditorModule.inspect( that.camera ); break;
			case "Render Settings": 
				var render_settings = that.render_settings || RenderModule.render_settings;
				EditorModule.showRenderSettingsDialog( render_settings );
			break;
			case "Perspective": that.editor_camera.type = LS.Camera.PERSPECTIVE; 
					that.name = "perspective";
				break;
			case "Orthographic": that.editor_camera.type = LS.Camera.ORTHOGRAPHIC; 
					that.name = "orthographic";
				break;
			default:
				break;
		}

		LS.GlobalScene.refresh();
	}});

	function inner_cameras( v,o,e ) 
	{
		that.showSelectCameraContextMenu( e, menu );
	}
}

LayoutViewport.prototype.showSelectCameraContextMenu = function( e, parent_menu )
{
	var that = this;

	var options = ["Editor"];
	var scene_cameras = LS.GlobalScene.getAllCameras();
	for(var i = 0; i < scene_cameras.length; i++)
	{
		var scene_camera = scene_cameras[i];
		options.push( { title: "Cam " + scene_camera._root.name, camera: scene_camera } );
	}

	var submenu = new LiteGUI.ContextMenu( options, { event: e, title: "Cameras", parentMenu: parent_menu, callback: function(v) {

		if(v == "Editor")
			that.setCamera(null);
		else
			that.setCamera( v.camera );
		LS.GlobalScene.refresh();
	}});
}

LayoutViewport.prototype.inspect = function( inspector )
{
	var that = this;
	inspector.addTitle("Layout");
	inspector.addString("Name", this.name, function(v){ that.name = v; });
	inspector.addVector4( "viewport", this._viewport, {
		precision: 2,
		step: 0.01,
		callback: function(v)
		{
			that._viewport.set(v);
			LS.GlobalScene.requestFrame();
		}
	});

	var options = ["Editor"];
	var selected = options[0];
	var scene_cameras = LS.GlobalScene.getAllCameras();
	for(var i = 0; i < scene_cameras.length; i++)
	{
		var scene_camera = scene_cameras[i];
		var option = { title: "Cam " + scene_camera._root.name, camera: scene_camera };
		options.push( option );
		if(that.camera == scene_camera)
			selected = option;
	}
	inspector.addCombo("Camera", selected, { values: options, callback: function(v){
		if(v == "Editor")
			that.setCamera( null );
		else
			that.setCamera( v.camera );

		inspector.refresh();	
	}});

	inspector.showComponent( this.camera );
}