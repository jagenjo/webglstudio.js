var LabModule = {
	name: "GPU",
	bigicon: "imgs/tabicon-debug.png",

	enabled: false,
	mode: "textures",

	offset: vec2.create(0,0),
	scale: 1,

	items: [],
	selected_item: null,

	_last_mouseup: 0,

	settings: {
		render_frame: false,
		render_filename: true,
		render_alpha: true
	},

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name , {id:"labtab", bigicon: this.bigicon, size: "full", callback: function(tab) {
			LabModule.enabled = true;
			RenderModule.canvas_manager.addWidget( LabModule );
			RenderModule.appendViewportTo( LabModule.tab.content );
		},
		callback_leave: function() {
			LabModule.enabled = false;
			RenderModule.appendViewportTo( null );
			RenderModule.canvas_manager.removeWidget( LabModule );
		}});

		var content = document.getElementById("labtab");
		content.style.padding = "0px";
		content.style.overflow = "hidden";

		var mode_tabs = new LiteGUI.Tabs({ id:"labmodetabs", callback: function(v) {   }});
		this.tab.add( mode_tabs );
		mode_tabs.root.style.marginTop = "4px";
		mode_tabs.root.style.backgroundColor = "#111";
		this.mode_tabs = mode_tabs;

		mode_tabs.addTab("Textures", function(){
			LabModule.mode = "textures";
		});
		mode_tabs.addTab("Meshes",function(){
			LabModule.mode = "meshes";
		});
		mode_tabs.addTab("Materials",function(){
			LabModule.mode = "materials";
		});

		/*
		mode_tabs.addTab("Shaders",function(){
			LabModule.mode = "shaders";
		});
		*/
		//enable WebGL Canvas2D renderer
		if( RenderModule.canvas_manager.canvas )
			this.prepareGL();
	},

	prepareGL: function()
	{
		enableWebGLCanvas( RenderModule.canvas_manager.canvas );

		this.camera = new LS.Camera();
		this.camera.lookAt([0,0,0],[0,0,-1],[0,1,0]);

		this._cubemap_shader = new GL.Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			uniform vec4 u_color;\n\
			uniform float u_rotation;\n\
			uniform samplerCube u_texture;\n\
			void main() {\n\
			  vec2 coord = v_coord * 2.0 - vec2(1.0);\n\
			  float dist = length(coord);\n\
			  if(dist > 1.1)\n\
			  {\n\
			  	gl_FragColor = vec4(0.0,0.0,0.0,1.0);\n\
			  	return;\n\
			  }\n\
			  if(dist > 0.99)\n\
			  	discard;\n\
			  vec3 dir = normalize(vec3( coord, 0.5 ));\n\
			  float c = cos(u_rotation);\n\
			  float s = sin(u_rotation);\n\
			  dir = vec3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);\n\
			  vec4 tex = textureCube(u_texture, dir);\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');

		//TODO: shadowmap shader
	},

	render: function()
	{
		if(!this.enabled) 
			return;

		gl.clearColor(0.02,0.02,0.02,1.0);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		this.camera.setOrthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1 );
		this.camera.updateMatrices();

		LS.Draw.push();
		LS.Draw.setCamera( this.camera );
		LS.Draw.setColor([1,1,1,1]);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);

		var ctx = gl; //nicer

		ctx.start2D(); //WebGLtoCanvas2D
		ctx.save();
		ctx.scale( this.scale, this.scale );
		ctx.translate( this.offset[0], this.offset[1] );

		ctx.fillStyle = "#444";
		ctx.font = "80px Arial";
		ctx.fillText( this.mode, 0, -40 );

		var total = 0;

		if(this.mode == "textures")
			total = this.renderTextures();
		else if (this.mode == "meshes")
			total = this.renderMeshes();
		else if (this.mode == "materials")
			total = this.renderMaterials();

		ctx.fillStyle = "#333";
		ctx.font = "40px Arial";
		ctx.fillText( total + " items", 400, -40 );

		gl.restore();
		gl.finish2D(); //WebGLtoCanvas2D
		LS.Draw.pop();
		return true;
	},

	renderTextures: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		this.items.length = 0;

		var num = 0;
		var textures = [];

		for(var i in LS.RM.textures)
		{
			var item = LS.RM.textures[i];
			if(item._is_internal)
				continue;
			textures.push(item);
		}

		textures = textures.concat( gl._texture_pool );

		for(var i = 0; i < textures.length; ++i)
		{
			var item = textures[i];
			if(!item)
				continue;
			var filename = item.filename || "";

			//is a thumbnail texture
			if(filename.substr(0,4) == "_th_")
				continue;

			num++;
			var tex = item;
			var w = size * tex.width / tex.height;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			/*
			var startx = posx;
			var starty = posy;
			var sizex = w;
			var sizey = h;
			*/

			var white = [1,1,1,1];
			var black = [0,0,0,1];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				if(tex.texture_type == gl.TEXTURE_2D)
				{
					//LS.Draw.renderPlane([posx + size*0.6, posy + size*0.6, 0], [size*0.5,-size*0.5], tex );
					if(!this.settings.render_alpha)
						gl.disable( gl.BLEND );
					else
						gl.enable( gl.BLEND );
					gl.drawImage(tex, posx, posy, w, h );
					gl.enable( gl.BLEND );
				}
				else
				{
					this._cubemap_shader.uniforms({u_rotation: getTime() * 0.001 });
					LS.Draw.renderPlane([ gl._matrix[6] + (posx + w*0.5) * gl._matrix[0], gl._matrix[7] + (posy + h*0.5) * gl._matrix[4], 0], [ w*0.5 * gl._matrix[0], -h*0.5 * gl._matrix[4] ], tex, this._cubemap_shader );
				}

				var text = filename.substr(0,24);
				if(this.settings.render_frame)
				{
					gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
					gl.strokeRect( posx, posy, w, h );
					gl.globalAlpha = 1;
				}
				if(this.settings.render_filename)
				{
					gl.fillColor = black;
					gl.fillText(text,posx + 6,posy + 16);
					gl.fillColor = white;
					gl.fillText(text,posx + 5,posy + 15);
				}
				this.items.push({id:i,type:"Texture",item: tex, x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
		return num;
	},

	renderMeshes: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		var mesh_camera = this._mesh_camera;
		if(!mesh_camera)
			mesh_camera = this._mesh_camera = new LS.Camera();

		var old_viewport = gl.getViewport();

		var matrix = mat4.create();
		if(this.meshes_axis == "Y")
			mat4.rotateY( matrix, matrix, getTime() * 0.0005 );
		else
			mat4.rotateZ( matrix, matrix, getTime() * 0.0005 );

		this.items.length = 0;

		var num = 0;
		for(var i in LS.RM.meshes)
		{
			var item = LS.RM.meshes[i];
			num++;
			var mesh = item;
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				//move camera to bounding area
				var bounding = mesh.bounding;
				var halfsize = BBox.getHalfsize( bounding );
				var center = BBox.getCenter( bounding );
				var radius = vec3.length( halfsize );
				mesh_camera.setPerspective( 45,1,0.1,radius * 4 );

				if(this.meshes_axis == "Y")
					mesh_camera.lookAt([ 0, radius * 0.5, radius * 2 ],[0,0,0],[0,1,0]);
				else
					mesh_camera.lookAt([ radius * 0.5, radius * 2, 0 ],[0,0,0],[0,0,1]);

				LS.Draw.pushCamera();
				LS.Draw.setCamera( mesh_camera );
				LS.Draw.setMatrix( matrix );
				LS.Draw.translate( -center[0], -center[1], -center[2]);

				gl.viewport( startx, starty, sizex, sizey );

				gl.disable( gl.BLEND );
				gl.enable( gl.DEPTH_TEST );
				LS.Draw.renderMesh( mesh, gl.TRIANGLES, LS.Draw.shader_phong );
				gl.enable( gl.BLEND );

				if( mesh.vertexBuffers["vertices"] ) //wireframe
				{
					if(!mesh.indexBuffers["wireframe"])
						mesh.computeWireframe();
					LS.Draw.renderMesh( mesh, gl.LINES, null, "wireframe" );
				}

				gl.disable( gl.DEPTH_TEST );

				gl.setViewport( old_viewport );
				LS.Draw.popCamera();

				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				gl.fillText(text,posx + 5,posy + 15);
				this.items.push({id:i,type:"Mesh",item: mesh, x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
		return num;
	},

	renderMaterials: function()
	{
		var posx = 0;
		var posy = 10;
		var size = 200;
		var margin = 20;
		gl.strokeStyle = "gray";
		gl.fillStyle = "white";
		gl.textAlign = "left";
		gl.font = "14px Arial";

		LS.Draw.reset_stack_on_reset = false;

		var old_viewport = gl.getViewport();

		this.items.length = 0;
		var num = 0;
		for(var i in LS.RM.materials)
		{
			var item = LS.RM.materials[i];
			num++;
			var material = item;
			var w = size;
			var h = size;

			var startx = gl._matrix[6] + (posx) * gl._matrix[0];
			var starty = gl.canvas.height - gl._matrix[7] + (-posy - h) * gl._matrix[4];
			var sizex = w * gl._matrix[0];
			var sizey = h * gl._matrix[4];

			if(startx <= gl.canvas.width && starty <= gl.canvas.height && 
				startx + sizex > 0 && starty + sizey > 0 )
			{
				gl.viewport( startx, starty, sizex, sizey );

				//render
				LS.Renderer.renderMaterialPreview( material, 1, { to_viewport: true, background_color: [0.1,0.1,0.1,1.0], rotate: 0.02 } );

				gl.setViewport( old_viewport );

				gl.disable( gl.DEPTH_TEST );
				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

				var filename = LS.RM.getFilename(i).substr(0,24);
				var text = filename;
				gl.globalAlpha = (this.selected_item && this.selected_item.item == item) ? 1 : 0.5;
				gl.strokeRect( posx, posy, w, h );
				gl.globalAlpha = 1;
				gl.fillText(text,posx + 5,posy + 15);

				this.items.push({id:i, item: material, type:"Material",x:posx,y:posy,w:w,h:h});
			}

			posx += w + margin;
			if(posx > gl.canvas.width - size + margin)
			{
				posx = 0;
				posy += h + margin;
			}
		}
		return num;
	},

	mousedown: function(e)
	{
		if(	(getTime() - this._last_mouseup) < 200 && this.selected_item ) //dblclick
			EditorModule.inspect( this.selected_item.item );

		return true;
	},

	mouseup: function(e)
	{
		if(e.click_time < 200)
		{
			this.selected_item = this.getItemAtPos(e.mousex, e.mousey);
			this._last_mouseup = getTime(); //for dblclick
		}
		return true;
	},

	mousemove: function(e)
	{
		if(e.dragging)
		{
			this.offset[0] += e.deltax / this.scale;
			this.offset[1] += e.deltay / this.scale;
		}

		return true;
	},
		
	mousewheel: function(e)
	{
		if(!this.enabled)
			return;

		this.changeScale( this.scale * (e.wheel > 0 ? 1.1 : 0.9), [e.canvasx, gl.canvas.height - e.canvasy] );
		e.stopPropagation();
		return true;
	},

	getItemAtPos: function(x,y)
	{
		var pos = this.convertOffsetToCanvas([x,y]);
		x = pos[0];
		y = pos[1];
		for( var i = 0; i < this.items.length; ++i)
		{
			var item = this.items[i];
			if( item.x < x && item.y < y && 
				x < (item.x + item.w) && y < (item.y + item.h))
				return item;
		}
		return null;
	},

	convertOffsetToCanvas: function(pos)
	{
		return [pos[0] / this.scale - this.offset[0], pos[1] / this.scale - this.offset[1]];
	},

	convertCanvasToOffset: function(pos)
	{
		return [(pos[0] + this.offset[0]) * this.scale, 
			(pos[1] + this.offset[1]) * this.scale ];
	},

	changeScale: function(value, zooming_center)
	{
		zooming_center = zooming_center || [gl.canvas.width * 0.5,gl.canvas.height * 0.5];
		var center = this.convertOffsetToCanvas( zooming_center );
		this.scale = value;

		var new_center = this.convertOffsetToCanvas( zooming_center );
		var delta_offset = [new_center[0] - center[0], new_center[1] - center[1]];

		this.offset[0] += delta_offset[0];
		this.offset[1] += delta_offset[1];
	}

};


CORE.registerModule( LabModule );