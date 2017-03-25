function LayoutViewport( options )
{
	options = options || {};

	this._viewport = vec4.fromValues(0,0,1,1);

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
		viewport: this._viewport
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

	//add gizmos
	this.addGizmos();
}

LayoutViewport.temp_vec4 = vec4.create();

LayoutViewport.prototype.render = function()
{
	//called after rendering the scene
	var camera = this.camera;
	var viewport = camera.getLocalViewport( null, LayoutViewport.temp_vec4 );

	gl.start2D();
	gl.strokeColor = this == RenderModule.active_viewport ? [0.75,0.75,0.75] : [0.5,0.5,0.5];
	gl.strokeRect( viewport[0], gl.canvas.height - viewport[3] - viewport[1],viewport[2] - 2,viewport[3] - 2);
	gl.globalAlpha = 0.5;
	gl.save();
	gl.translate( viewport[0], gl.canvas.height - viewport[3] - viewport[1] );
	gl.fillStyle = "black";
	gl.fillRect( viewport[2] - 121, 1, 120, 14 );
	gl.font = "14px Arial";
	gl.globalAlpha = 0.75;
	gl.fillStyle = "white";
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

LayoutViewport.prototype.getCamera = function()
{
	return this.scene_camera || this.editor_camera;
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