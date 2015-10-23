//Camera Gizmo attached to a camera viewport
function CameraGizmo( camera )
{
	this.name = "camera gizmo";
	this.selected_axis = null;
	this.texture_selected_axis = null;
	this.gizmo_size = 1;

	//where is located the gizmo
	this.viewport = vec4.fromValues(0,0,80,80);
	this.orbiting = false;

	this.camera = camera;
	this.camera_viewport = vec4.create();
	this.vp = mat4.create();

	//camera used for rendering the gizmo
	this.render_camera = new Camera({near: 0.1, far: 100, frustum_size:2} );

	this.updateTexture();
	this.updateMesh();
}

CameraGizmo.axis = [{name:"+X",v:[1,0,0],up:[0,1,0]},
		{name:"-X",v:[-1,0,0],up:[0,1,0]},
		{name:"+Y",v:[0,1,0],up:[0,0,1]},
		{name:"-Y",v:[0,-1,0],up:[0,0,-1]},
		{name:"+Z",v:[0,0,1],up:[0,1,0]},
		{name:"-Z",v:[0,0,-1],up:[0,1,0]}];

CameraGizmo.prototype.render = function()
{
	if(RenderModule.render_options.ingame)
		return;

	if(this.mesh && this.mesh.gizmo_size != this.gizmo_size)
		this.updateMesh();

	Draw.push();
	gl.disable( gl.DEPTH_TEST );
	gl.enable( gl.BLEND );
	gl.enable( gl.CULL_FACE );
	gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

	var camera = this.camera;
	var front = camera.getLocalVector( vec3.fromValues(0,0,3) );
	var up = camera.getLocalVector( vec3.fromValues(0,1,0) );

	this.render_camera.lookAt(front,[0,0,0],up);
	//this.camera.fov = cam.fov;
	this.render_camera.type = camera.type;
	this.render_camera.updateMatrices();

	//extract viewport
	camera.getLocalViewport( null, this.camera_viewport );

	this.viewport[0] =  this.camera_viewport[0] +  this.camera_viewport[2] - this.viewport[2];
	this.viewport[1] =  this.camera_viewport[1] +  this.camera_viewport[3] - this.viewport[3];
	gl.viewport(this.viewport[0],this.viewport[1],this.viewport[2],this.viewport[3]);

	Draw.pushCamera();
	Draw.setCamera( this.render_camera );
	//Draw.setAlpha(this.selected_axis ? 0.8 : 0.5);
	Draw.setAlpha( camera == RenderModule.under_camera ? 0.6 : 0.4);
	Draw.setColor([1,1,1]);
	if(this.texture)
		this.texture.bind(0);
	if(this.mesh)
		Draw.renderMesh( this.mesh, gl.TRIANGLES, Draw.shader_texture );
	Draw.popCamera();

	Draw.pop();
	gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
	gl.enable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND  );
};

CameraGizmo.prototype.insideGizmoArea = function(e)
{
	var mousey = (gl.canvas.height - e.mousey); //reverseY
	if( e.mousex < this.viewport[0] ||
		e.mousex > (this.viewport[0] + this.viewport[2]) || 
		mousey < this.viewport[1] ||
		mousey > (this.viewport[1] + this.viewport[3]))
		return false;
	return true;
}

CameraGizmo.prototype.checkSide = function(e)
{
	var mousey = (gl.canvas.height - e.mousey); //reverseY
	if(!this.insideGizmoArea(e))
		return;

	var ray = this.render_camera.getRayInPixel( e.mousex, mousey, this.viewport );
	//var ray = {start:[0,0,-10],direction:[0,0,1]};
	var result = vec3.create();
		
	if( geo.testRaySphere(ray.start, ray.direction, vec3.create([0,0,0]), this.gizmo_size * 0.6, result) )
	{
		vec3.normalize(result,result);
		var max_dot = -1;
		var selected = null;
		for(var i in CameraGizmo.axis)
		{
			var axis = CameraGizmo.axis[i];
			axis.dot = vec3.dot(result,axis.v);
			if(axis.dot < max_dot) continue;
			max_dot = axis.dot;
			selected = axis;
		}
		return selected;
	}

	return null;
},

CameraGizmo.prototype.mousedown = function(e)
{
	if(!this.insideGizmoArea(e))
		return;

	e.preventDefault();
	e.stopPropagation();

	if(e.button == 0)
	{
		this.orbiting = true;
	}

	if(e.button == 2)
	{
		var options = ["Camera Info","Perspective","Orthographic",null,"Editor Cam"];

		var scene_cameras = LS.GlobalScene._cameras;
		for(var i = 0; i < scene_cameras.length; i++)
		{
			var scene_camera = scene_cameras[i];
			options.push( { title: "Cam " + scene_camera._root.name, camera: scene_camera } );
		}


		var menu = new LiteGUI.ContextualMenu( options, {event: e, title: "Cameras", callback: (function(v) { 
			var camera = this.camera;
			switch( v )
			{
				case "Camera Info": EditorModule.inspectObject( camera ); break;
				case "Perspective": camera.type = LS.Camera.PERSPECTIVE; break;
				case "Orthographic": camera.type = LS.Camera.ORTHOGRAPHIC; break;
				case "Editor Cam": 
					var cam = new LS.Camera();
					cam._viewport.set( this.camera._viewport );
					RenderModule.setViewportCamera( this.camera._editor.index, cam );
					this.camera = cam;
					break;
				default:
					RenderModule.setViewportCamera( this.camera._editor.index, v.camera );
					this.camera = v.camera;
					break;
			}
			LS.GlobalScene.refresh();
		}).bind(this) });
		return true;
	}
}

CameraGizmo.prototype.mousemove = function(e)
{
	var selected = this.checkSide(e);
	if(selected)
	{
		this.selected_axis = selected;
		this.updateTexture();
		LS.GlobalScene.refresh();
	}
	else
	{
		this.selected_axis = null;
		if(this.texture_selected_axis)
		{
			this.updateTexture();
			LS.GlobalScene.refresh();
		}
	}

	//trace("D: " + e.dragging);

	if(e.dragging && this.orbiting)
	{
		//trace(e.deltaX);
		cameraTool.onCameraDrag( e, this.camera );
		LS.GlobalScene.refresh();
		return true;
	}
},

CameraGizmo.prototype.mouseup = function(e)
{
	this.orbiting = false;
	e.preventDefault();
	e.stopPropagation();

	if(e.click_time > 300 || e.button != 0)
		return true;

	var selected = this.checkSide(e);
	if(selected)
	{
		var camera = this.camera;

		var center = camera.getCenter();
		var dist = vec3.sub( vec3.create(), camera.getEye(), center );
		var delta = vec3.scale( vec3.create(), selected.v, vec3.length( dist ) );
		camera.eye = vec3.add( delta, center, delta );
		camera.up = selected.up;
		LS.GlobalScene.refresh();
	}

	return true;
}

CameraGizmo.prototype.updateTexture = function()
{
	if(this.texture && this.texture_selected_axis == this.selected_axis)
		return;

	var canvas = this.canvas || createCanvas(256,256);
	//$("body").append(canvas);

	var ctx = canvas.getContext("2d");
	ctx.save();
	ctx.fillStyle = "black";
	ctx.strokeStyle = "white";
	ctx.fillRect(0,0,canvas.width, canvas.height);
	ctx.translate(0,canvas.height);
	ctx.scale(1,-1);
	ctx.font = "40px Arial";
	var text = ["-X","+X","-Z","+Z","+Y","-Y"];//,"FO1","FO2","FO3","FO4","FO5","FO6","FO7","FO8","FO9","*"];

	ctx.fillStyle = "white";
	var size = canvas.width / 4;
	ctx.lineWidth = 2;
	for(i = 0; i < text.length; i++)
	{
		var is_selected = false;
		if( this.selected_axis && text[i] == this.selected_axis.name )
			is_selected = true;

		var startx = i*size % canvas.width;
		var starty = Math.floor(i*size / canvas.width) * size;

		ctx.fillStyle = is_selected ? "#554" : "#222";
		ctx.fillRect(startx+0.5,starty+0.5,size,size);

		ctx.strokeStyle = "white";
		ctx.strokeRect(startx+0.5,starty+0.5,size,size);

		ctx.fillStyle = "white";
		ctx.fillText(text[i],startx+0.5+size*0.15,starty+0.5+size*0.7);
	}
	ctx.restore();

	this.texture_selected_axis = this.selected_axis;
	this.canvas = canvas;
	if(!this.texture)
		this.texture = GL.Texture.fromImage( this.canvas );
	else
		this.texture.uploadImage( this.canvas );
}

CameraGizmo.prototype.updateMesh = function()
{
	var size = this.gizmo_size;
	sizex = size*0.5;
	sizey = size*0.5;
	sizez = size*0.5;
	var uv_size = 1 / 4;

	var vertices = [
		[-sizex,+sizey,-sizez],[-sizex,-sizey,+sizez],[-sizex,+sizey,+sizez],[-sizex,+sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,-sizey,+sizez],
		[+sizex,+sizey,+sizez],[+sizex,-sizey,-sizez],[+sizex,+sizey,-sizez],[+sizex,+sizey,+sizez],[+sizex,-sizey,+sizez],[+sizex,-sizey,-sizez],
		[+sizex,+sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,+sizey,-sizez],[+sizex,+sizey,-sizez],[+sizex,-sizey,-sizez],[-sizex,-sizey,-sizez],
		[-sizex,+sizey,+sizez],[+sizex,-sizey,+sizez],[+sizex,+sizey,+sizez],[-sizex,+sizey,+sizez],[-sizex,-sizey,+sizez],[+sizex,-sizey,+sizez],
		[-sizex,+sizey,-sizez],[+sizex,+sizey,+sizez],[+sizex,+sizey,-sizez],[-sizex,+sizey,-sizez],[-sizex,+sizey,+sizez],[+sizex,+sizey,+sizez],
		[+sizex,-sizey,-sizez],[-sizex,-sizey,+sizez],[-sizex,-sizey,-sizez],[+sizex,-sizey,-sizez],[+sizex,-sizey,+sizez],[-sizex,-sizey,+sizez],
		];
	var coords = [];
	addCoords(0,0);
	addCoords(uv_size,0);
	addCoords(uv_size*2,0);
	addCoords(uv_size*3,0);
	addCoords(0,uv_size);
	addCoords(uv_size,uv_size);

	var mesh = GL.Mesh.load({ vertices: vertices, coords: coords });
	this.mesh = mesh;
	mesh.gizmo_size = size;

	function addCoords(startx, starty)
	{
		coords.push([startx,starty],[startx+uv_size,starty+uv_size],[startx+uv_size,starty],[startx,starty],[startx,starty+uv_size],[startx+uv_size,starty+uv_size]);
	}
}

