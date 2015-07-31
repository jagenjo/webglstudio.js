//************* TOOLS *******************

/* This tool handles the node selection and the camera movement */

var cameraTool = {
	name: "cameraTool",
	mode: "orbit",

	enabled: true,
	scale_dist: 0,

	auto_select: true,
	smooth_camera: false,

	onRegister: function() {
		LEvent.bind(Scene,"serializing", function(e,o) { 
			if(!o.extra) o.extra = {};
			o.extra.camera_mode = { 
				mode: cameraTool.mode, 
				orbit: cameraTool.cam_orbit, 
				smooth_camera: cameraTool.smooth_camera, 
				min: cameraTool.min_camera_dist, 
				max: cameraTool.max_camera_dist,
				focus_point: cameraTool.focus_point
			};
		});
		LEvent.bind(Scene,"configure", function(e,o) { 
			if(!o.extra || !o.extra.camera_mode) return;

			cameraTool.mode = o.extra.camera_mode.mode;
			cameraTool.cam_orbit = o.extra.camera_mode.orbit;
			cameraTool.smooth_camera = o.extra.camera_mode.smooth_camera;
			cameraTool.min_camera_dist = o.extra.camera_mode.min;
			cameraTool.max_camera_dist = o.extra.camera_mode.max;
			cameraTool.focus_point = o.extra.camera_mode.focus_point;
		});
	},

	update: function(dt)
	{
		var speed = 100;
		if(gl.keys['SHIFT'])
			speed *= 10;

		if (cameraTool.mode == 'free')
		{
			var update = true;
			if( gl.keys["UP"] ) this.moveCamera(0,0,-speed*dt);
			else if( gl.keys["DOWN"]  ) this.moveCamera(0,0,speed*dt);

			if( gl.keys["LEFT"]  ) this.moveCamera(-speed*dt,0,0);
			else if( gl.keys["RIGHT"]  ) this.moveCamera(speed*dt,0,0);
		}

		if(cameraTool.mode == "orbit")
		{
			if( gl.keys["UP"] ) this.moveCamera(0,0,-speed*dt);
			else if( gl.keys["DOWN"]  ) this.moveCamera(0,0,speed*dt);

			this.updateOrbitCamera(dt);
		}
	},

	setFocusPointOnNode: function(node, center_in_mesh) {
		if(!node) return;

		var mesh = node.getMesh();
		if(!mesh)
		{
			this.focus_point = node.transform.getPosition();
			return;
		}

		var center = [0,0,0];
		cameraTool.min_camera_dist = 1;
		cameraTool.max_camera_dist = 1000;

		if(center_in_mesh)
		{
			var mesh = node.getMesh();
			var bounding = mesh.bounding || mesh.info;
			if ( bounding.aabb_center )
				center = bounding.aabb_center.concat();
			if ( bounding.radius ) //adjust min and max
			{
				var radius = bounding.radius;
				radius = node.transform.transformVectorGlobal([0,0,radius])[2];
				radius *= node.transform._scale[2];
				cameraTool.cam_orbit[2] = radius * 2.5;
				if(cameraTool.cam_orbit[2] > Scene.current_camera.far)
					cameraTool.cam_orbit[2] = Scene.current_camera.far;
				//cameraTool.min_camera_dist = radius * 0.2;
				cameraTool.max_camera_dist = radius * 40;
			}
		}

		cameraTool.focus_point = node.transform.transformPoint( center );
	},

	moveCamera: function(x,y,z)
	{
		var camera = Scene.current_camera;
		var view_matrix = mat4.lookAt(mat4.create(), camera._eye, camera._center, camera._up );
		mat4.invert(view_matrix, view_matrix);
		var temp = vec3.fromValues(x,y,z);
		var delta = mat4.rotateVec3(temp, view_matrix, temp);
		vec3.add(camera.eye, camera._eye, delta);
		vec3.add(camera.center, camera.center, delta);
		//camera.updateNodeTransform();

		Scene.refresh();
	},

	rotateCamera: function(angle_in_degrees, axis, in_local_space)
	{
		if( Math.abs(angle_in_degrees) < 0.00001) return;
		var camera = Scene.current_camera;
		if(!camera) return;

		var front = vec3.subtract(vec3.create(), camera.center, camera.eye);
		var dist = vec3.length( front );
		var up = vec3.clone( camera._up );

		if(in_local_space)
		{
			var view_matrix = mat4.lookAt(mat4.create(), camera._eye, camera._center, up );
			var inv = mat4.invert(view_matrix, view_matrix); 
			mat4.rotateVec3(axis, inv, axis );
		}

		var R = mat4.create();
		mat4.rotate(R, R, angle_in_degrees * DEG2RAD, axis );
		var new_front = mat4.rotateVec3(vec3.create(),R,front);
		vec3.normalize(new_front, new_front);
		vec3.scale(new_front,new_front,dist);
		var new_up = mat4.rotateVec3(vec3.create(), R, up);
		vec3.normalize( new_up , new_up );

		camera.center = vec3.add(camera.center, camera.eye, new_front );
		//camera.updateNodeTransform();
		//camera.up = new_up.toArray();
	},

	keydown: function(e) {
	},

	click_pos: [0,0],

	mousedown: function(e) {
		this.click_pos = [e.mousex,e.mousey];
	},

	mouseup: function(e) {
		if(!this.enabled) return;

		/*
		var now = new Date().getTime();
		var dist = Math.sqrt((e.mousex - this.click_pos[0])*(e.mousex - this.click_pos[0])+(e.mousey - this.click_pos[1])*(e.mousey - this.click_pos[1]));
		if (now - RenderModule.viewport3d.click_time < 200 && this.auto_select && dist < 50) //fast click
		{
			//trace(dist);
			var node = RenderPipeline.getNodeAtCanvasPosition(Scene, e.mousex,e.mousey);
			if(node)
			{
				RenderModule.setSelectedNode(node);
				var mesh = node.getMesh();
				if(mesh && mesh.info)
					this.scale_dist = mesh.info.radius;
			}
		}
		*/
		Scene.refresh();
	},

	mousemove: function(e) 
	{
		//Scene.getNodeAtCanvasPosition(e.x,e.y);
		if(!this.enabled) return;

		if (e.dragging) {
			this.onCameraDrag(e);
			Scene.refresh();
		}
	},

	updateOrbitCamera: function(seconds) {
		var R = mat4.create();
		var R_yaw = mat4.create();
		mat4.rotate(R_yaw, R_yaw, -this.cam_orbit[0] * DEG2RAD, [0,1,0] );
		var R_pitch = mat4.create();
		mat4.rotate(R_pitch, R_pitch, -this.cam_orbit[1] * DEG2RAD, [1,0,0] );
		mat4.multiply(R, R_yaw, R_pitch);
		var delta = mat4.multiplyVec3(vec3.create(), R,[0,0, this.cam_orbit[2]]);

		/* lightgl
		var R_yaw = GL.Matrix.rotate( -RenderModule.cam_orbit[0], 0,1,0 );
		var R_pitch = GL.Matrix.rotate( -RenderModule.cam_orbit[1], 1,0,0 );
		var R = R_yaw.multiply(R_pitch);
		var delta = R.transformPoint( new GL.Vector(0,0, RenderModule.cam_orbit[2]) ).toArray();
		*/

		var center = vec3.toArray( cameraTool.focus_point );
		var eye = [ delta[0] + center[0], delta[1] + center[1], delta[2] + center[2]];

		//interpolate camera
		var camera = Scene.getCamera();
		if(camera)
		{
			if(this.smooth_camera)
			{
				var f = 0.8;
				for(var i = 0; i < 3; i++)
				{
					camera.eye[i] = camera.eye[i] * f + eye[i] * (1-f);
					camera.center[i] = camera.center[i] * f + center[i] * (1-f);
					Scene.refresh();
				}
			}
			else
			{
				for(var i = 0; i < 3; i++)
				{
					camera.eye[i] = eye[i];
					camera.center[i] = center[i];
				}
			}
		}
	},

	onCameraDrag: function(e)
	{
		if(this.mode == 'orbit')
			this.onCameraOrbit(e);
		else if (this.mode == 'free')
			this.onCameraFree(e);
		else if (this.mode == 'fov')
			this.onCameraFov(e);
	},

	onCameraFree: function(e)
	{
		var scale_factor = 0.2;

		var drag_x = e.deltax * scale_factor;
		var drag_y = e.deltay * scale_factor;

		if(e.ctrlKey)
		{
			this.moveCamera(-drag_x,drag_y,0);
		}
		else
		{
			this.rotateCamera(-drag_x, [0,1,0], false);
			this.rotateCamera(-drag_y, [1,0,0], true);
		}
	},


	onCameraFov: function(e)
	{
		var scale_factor = 0.1;
		var drag_y = e.deltay * scale_factor;
		if(Scene.current_camera.type == "orthographic")
			Scene.current_camera.frustrum_size += drag_y;
		else
			Scene.current_camera.fov += drag_y;
	},

	onCameraOrbit: function(e)
	{
		this.orbitCamera(e.deltax, e.deltay, e.ctrlKey, e.shiftKey );
	},

	orbitCamera: function(deltax, deltay, panning, vertical)
	{
		var scale_factor = 0.5;
		var camera = Scene.getCamera();

		var drag_x = 0;
		var drag_y = 0;
		var delta_yaw = 0;
		var delta_pitch = 0;
		var delta_dist = 1;
		var delta_fov = 0;

		if(panning)
		{
			drag_x = deltax * scale_factor * this.cam_orbit[2] * 0.1;
			drag_y = deltay * scale_factor * this.cam_orbit[2] * 0.1;
		}
		else
		{
			delta_yaw = deltax * scale_factor;
			if(vertical)
				delta_pitch = deltay * scale_factor;
			else
				delta_dist = 1.0 + (deltay * scale_factor * 0.01);
		}

		//drag focus point
		if(drag_x != 0 || drag_y != 0)
		{
			var up = vec3.fromValues(0,1,0);
			var front = vec3.subtract(vec3.create(), camera._center, camera._eye );
			vec3.normalize( front , front );
			var right = vec3.cross( vec3.create(), front, up );
			vec3.normalize(right, right);

			var delta = vec3.scale( vec3.create(), up, deltay * scale_factor );
			vec3.scale(right, right, deltax * scale_factor );
			vec3.add(delta, delta, right);

			this.focus_point[0] += -delta[0];
			this.focus_point[1] += delta[1];
			this.focus_point[2] += -delta[2];
		}

		//move camera
		this.cam_orbit[0] += delta_yaw;
		this.cam_orbit[1] += delta_pitch;

		if(this.cam_orbit[1] >= 89.99)
			this.cam_orbit[1] = 89.99;
		else if(this.cam_orbit[1] <= -89.99)
			this.cam_orbit[1] = -89.99;

		this.cam_orbit[2] *= delta_dist;
		if(this.cam_orbit[2] < this.min_camera_dist) 
			this.cam_orbit[2] = this.min_camera_dist;
		else if (this.cam_orbit[2] > this.max_camera_dist) 
			this.cam_orbit[2] = this.max_camera_dist;
	}
};

//ToolsModule.registerTool( cameraTool );
ToolsModule.registerTool({ name: "orbit_camera", keyShortcut: 84, description: "Orbit camera", icon: "media/icons/mini-icon-orbit.png", section: "camera", module: cameraTool, onEnable: function() { cameraTool.mode = "orbit"; }, keep_module: true });
ToolsModule.registerTool({ name: "free_camera", keyShortcut: 89, description: "Free camera", icon: "media/icons/mini-icon-camera.png", section: "camera", module: cameraTool, onEnable: function() { cameraTool.mode = "free"; } });
ToolsModule.registerTool({ name: "fov_camera", description: "Field of View", icon: "media/icons/mini-icon-fov.png", section: "camera", module: cameraTool, onEnable: function() { cameraTool.mode = "fov"; } });

