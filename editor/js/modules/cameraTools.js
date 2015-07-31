//************* TOOLS *******************

/* This tool handles the node selection and the camera movement */

var cameraTool = {
	name: "cameraTool",
	enabled: true,
	control_mode: "max", //not used

	auto_select: true,
	smooth_camera: false,

	last_camera: null,

	settings: {
		rotate_speed: 0.2,
		orbit_speed: 0.01,
		smooth_camera_factor: 0.3,
		mouse_wheel_factor: 0.002
	},
	
	collision: vec3.create(),

	onRegister: function()
	{
		RenderModule.viewport3d.addModule(this);
	},

	keydown: function(e) {
	},

	mousedown: function(e) {
		this.click_pos = [e.mousex,e.mousey];
		var cam = ToolUtils.getCamera(e);
		this.last_camera = cam;
		this.in_use = true;

		//if(e.which == GL.MIDDLE_MOUSE_BUTTON)
		{
			var center = cam.getCenter();
			ToolUtils.testPerpendicularPlane( e.canvasx, gl.canvas.height - e.canvasy, center, cameraTool.collision );
		}

		if(e.which == GL.RIGHT_MOUSE_BUTTON)
		{
			e.cancelBubble = true;
		}

	},

	mouseup: function(e) {
		if(this.in_use)
		{
			this.in_use = false;
			LiteGUI.setCursor(null);
			LS.GlobalScene.refresh();
		}
		if(!this.enabled) 
			return;
	},

	mousemove: function(e) 
	{
		//Scene.getNodeAtCanvasPosition(e.x,e.y);
		if(!this.enabled) 
			return;

		if (e.dragging) {
			var r = this.onCameraDrag(e);
			LS.GlobalScene.refresh();
			return r;
		}
		else
		{
			this.in_use = false;
		}
	},

	mousewheel: function(e)
	{
		//console.log(e.wheel);
		if(e.wheel)
		{
			var amount = this.getWheelDelta(e);
			this.changeCameraDistance( amount, ToolUtils.getCamera(e) );
		}
	},

	//different browsers and OSs behave different	
	getWheelDelta: function(e)
	{
		var amount = e.wheel;
		if(amount == 120 || amount == -120)
			amount = 1 + this.settings.mouse_wheel_factor * (amount > 0 ? 1 : -1);
		else
			amount = 1.0 + amount * this.settings.mouse_wheel_factor;	
		return amount;
	},

	update: function(dt)
	{
		var speed = 100;
		if(gl.keys['SHIFT'])
			speed *= 10;

		var update_frame = false;

		if( gl.keys["UP"] ) { this.moveCamera([0,0,-speed*dt], true); update_frame = true; }
		else if( gl.keys["DOWN"]  ) { this.moveCamera([0,0,speed*dt], true); update_frame = true; }

		if( gl.keys["LEFT"]  ) { this.moveCamera([-speed*dt,0,0],true); update_frame = true; }
		else if( gl.keys["RIGHT"]  ) { this.moveCamera([speed*dt,0,0],true); update_frame = true; }

		//apply camera smoothing
		var cameras = RenderModule.cameras;
		for(var i = 0, l = cameras.length; i < l; ++i)
		{
			var camera = cameras[i];
			if(this.smooth_camera)
			{
				var factor = Math.clamp( this.settings.smooth_camera_factor, 0.1, 1); //clamp otherwise bad things would happend
				if(!camera.editor)
					continue;

				if(vec3.distance(camera.eye, camera.editor.destination_eye) > 0.001)
				{
					vec3.lerp( camera.eye, camera.eye, camera.editor.destination_eye, factor );
					camera._must_update_view_matrix = true; //force must_update
					update_frame = true;
				}

				if(vec3.distance(camera.center, camera.editor.destination_center) > 0.001)
				{
					vec3.lerp( camera.center, camera.center, camera.editor.destination_center, factor );
					camera._must_update_view_matrix = true; //force must_update
					update_frame = true;
				}
			}
			else
			{
				camera.editor.destination_eye.set( camera.eye );
				camera.editor.destination_center.set( camera.center );
			}
		}

		if(update_frame)
			LS.GlobalScene.refresh();
	},


	onCameraDrag: function(e)
	{
		//console.log(e);
		//console.log(e.which);
		//console.log(gl.mouse_buttons);
		var camera = this.last_camera || ToolUtils.getCamera(e);

		if(e.isButtonPressed(GL.LEFT_MOUSE_BUTTON) && e.isButtonPressed(GL.RIGHT_MOUSE_BUTTON))  //left and right
		{
			cameraTool.moveCamera([0,0,e.deltay],true, camera);
		}
		else if(e.isButtonPressed(GL.MIDDLE_MOUSE_BUTTON)) //wheel mouse
		{
			if(e.altKey || e.metaKey) //orbit
			{
				this.orbit(e, camera);
			}
			else //panning
			{
				LiteGUI.setCursor("move");
				this.panning(e, camera);
			}
		}
		else 
		{
			if(e.isButtonPressed(GL.RIGHT_MOUSE_BUTTON))
				cameraTool.rotateCamera( e.deltax * this.settings.rotate_speed, e.deltay * -this.settings.rotate_speed, camera );
			else if(e.isButtonPressed(GL.LEFT_MOUSE_BUTTON))
			{
				if(e.metaKey)
					this.panning(e, camera);
				else
					this.orbit(e, camera);
			}
		}
		/*
		else if(e.button == 2) //right mouse
		{
			if(e.altKey || e.metaKey) //orbit
				cameraTool.rotateCamera( e.deltax * this.settings.rotate_speed, e.deltay * -this.settings.rotate_speed );
			else
				cameraTool.orbitCamera( e.deltax * this.settings.orbit_speed, e.deltay * -this.settings.orbit_speed );
		}
		*/
	},
	
	orbit: function( e, camera )
	{
		this.orbitCamera( e.deltax *  this.settings.orbit_speed, e.deltay * -this.settings.orbit_speed, camera );
	},
	
	panning: function( e, camera )
	{
		var center = camera.getCenter();
		var collision = vec3.create();

		ToolUtils.testPerpendicularPlane( e.canvasx, gl.canvas.height - e.canvasy, center, collision, camera );
		var delta = vec3.sub( vec3.create(), cameraTool.collision, collision);
		this.moveCamera( delta, false, camera );
	},

	orbitCamera: function(yaw,pitch, camera)
	{
		camera = camera || ToolUtils.getCamera();
		var center = camera.getCenter();

		var right = camera.getLocalVector([1,0,0]);
		var dist = vec3.sub( vec3.create(), this.smooth_camera ? camera.editor.destination_eye : camera.getEye(), center );

		vec3.rotateY( dist, dist, yaw );
		var R = quat.create();
		quat.setAxisAngle( R, right, pitch );

		vec3.transformQuat( dist, dist, R );
		var new_eye = vec3.add( camera.editor.destination_eye, dist, center );

		if(!this.smooth_camera)
			camera.eye = new_eye;
	},

	moveCamera: function(delta, in_local_space, camera )
	{
		camera = camera || ToolUtils.getCamera();

		//var eye = this.smooth_camera ? camera.editor.destination_eye : camera.getEye();
		//var center = this.smooth_camera ? camera.editor.destination_center : camera.getCenter();

		var eye = camera.getEye();
		var center = camera.getCenter();

		if(in_local_space)
			delta = camera.getLocalVector(delta);

		var new_eye = vec3.add( camera.editor.destination_eye, delta, eye );
		var new_center = vec3.add( camera.editor.destination_center, delta, center );

		if(!this.smooth_camera)
		{
			camera.eye = new_eye;
			camera.center = new_center;
		}
	},

	rotateCamera: function(yaw, pitch, camera)
	{
		camera = camera || ToolUtils.getCamera();
		camera.rotate( -yaw, [0,1,0] );
		camera.rotate( pitch, [1,0,0], true );

		if(camera.editor)
		{
			camera.editor.destination_eye.set( camera.eye );
			camera.editor.destination_center.set( camera.center );
		}
	},

	changeCameraDistance: function(dt, camera)
	{
		camera = camera || ToolUtils.getCamera();

		var center = camera.getCenter();
		var dist = vec3.sub( vec3.create(), camera.getEye(), center );
		vec3.scale( dist, dist, dt );

		if(camera.type == LS.Camera.ORTHOGRAPHIC)
			camera.frustum_size = vec3.length(dist);

		var new_eye = vec3.add( camera.editor.destination_eye, dist, center );

		if(!this.smooth_camera)
			camera.eye = new_eye;

		LS.GlobalScene.refresh();
	},

	/*
	setFocusPointOnNode: function(node, center_in_mesh) {
		if(!node) return;

		var center = vec3.create();

		if(node.transform)
		{
			var mesh = node.getMesh();
			if(!mesh)
				center = node.transform.getGlobalPosition();
			else
			{
				if(center_in_mesh)
				{
					var mesh = node.getMesh();
					var bounding = mesh.bounding;
					center.set( BBox.getCenter(mesh.bounding) );
					center = node.transform.transformPointGlobal(center, center);
				}
			}
		}

		this.setFocusPoint(center);
	},
	*/

	setFocusPoint: function( point ) {
		var camera = this.last_camera || ToolUtils.getCamera();

		if(!this.smooth_camera)
			camera.center = point;
		else
			camera.editor.destination_center.set( point );
	}

};

ToolsModule.registerTool({ name: "camera_control", display: false, module: cameraTool });


