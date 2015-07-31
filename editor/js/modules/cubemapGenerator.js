/* This module allows to create Cubemaps and store them as resources */
var CubemapGenerator = {
	default_resolution: 64,

	init: function()
	{
		LiteGUI.menubar.add("Actions/Cubemap generator", { callback: function() { CubemapGenerator.showDialog(); }});

		LS.ShadersManager.registerGlobalShader( ShadersManager.common_vscode + '\
			varying vec2 coord;\
			void main() {\
			coord = a_coord;\
			gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\
		}\
		', ShadersManager.common_pscode + '\
			#define PI 3.14159265358979323846264\n\
			uniform samplerCube texture;\
			uniform vec4 color;\
			varying vec2 coord;\
			void main() {\
				float alpha = (coord.x * 2.0) * PI;\
				float beta = (coord.y * 2.0 - 1.0) * PI * 0.5;\
				vec3 N = vec3( -cos(alpha) * cos(beta), sin(beta), sin(alpha) * cos(beta) );\
				gl_FragColor = color * textureCube(texture,N);\
			}\
		',"cubemap_to_polar");
	},

	showDialog: function()
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog("dialog_cubemap", {title:"Cubemap generator", parent:"#visor", close: true, minimize: true, width: 300, min_height: 160, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var name = "cubemap_" + (Math.random() * 1000).toFixed(0);
		var resolution = CubemapGenerator.default_resolution;
		var center = "camera eye";
		var result = "cubemap";

		var widgets = new LiteGUI.Inspector("cubemapgen_widgets",{  });
		widgets.name_width = 150;
		dialog.content.appendChild( widgets.root );
		widgets.addCombo("Resolution", CubemapGenerator.default_resolution, { values: [32,64,128,256,512,1024], callback: function(v) { 
			resolution = v;
		}});


		widgets.addString("Name", name, { callback: function(v) { 
			name = v;
		}});

		widgets.addTitle("Generate from Scene");

		widgets.addCombo("Center", center , { values: ["camera eye","camera target","node"], callback: function(v) { 
			center = v;
		}});

		widgets.addButton("Preview", "Open Window", { callback: function(v) { 
			var position = computePosition();
			var image = CubemapGenerator.generateCubemap(resolution, position );

			var new_window = window.open("","Visualizer","width="+resolution+", height="+(resolution*6));
			new_window.document.body.appendChild( image );
			LS.GlobalScene.refresh();
		}});


		/*
		widgets.addCombo("Result", "cubemap", { values: ["cubemap","spherical","image x6"], callback: function(v) { 
			result = v;
		}});
		*/

		widgets.addSeparator();


		widgets.addButton(null, "Create cubemap", { callback: function() {
			var position = computePosition();
			var image = CubemapGenerator.generateCubemap( resolution, position );

			/*
			if(keep)
			{
				image.link = image.toDataURL('image/jpg');
				LS.ResourcesManager.registerResource( name + "_intermediate.png", image );
			}
			*/
			
			var texture = GL.Texture.cubemapFromImage( image );
			texture.image = image;
			LS.ResourcesManager.registerResource( name + ".png", texture );
			LiteGUI.alert("Cubemap created with name: " + name + ".png");
		}});

		widgets.addTitle("Load from Image");
		var url = "";
		var original_file = null;
		widgets.addString("URL","", { callback: function(v){ url = v; original_file = null; }});
		widgets.addFile("From File", null, { generate_url: true, callback: function(file_info){ 
			if(!file_info)
			{
				url = original_file = null;
				return;
			}
			url = file_info.url; 
			original_file = file_info.file;
		}});

		var cubemap_options = { keep_image: true, is_cross: 1 };
		var values = { "Cross Left": "CUBECROSSL", "Vertical": "CUBEVERT" };
		var mode = "CUBECROSSL";
		widgets.addCombo("Input Mode",mode, { values: values, callback: function(v){
			mode = v;
			if(v == "CUBECROSSL")
				cubemap_options = { keep_image: true, is_cross: 1 };
			else
				cubemap_options = { keep_image: true };
		}});

		var info_widget = widgets.addInfo(null, "" );

		widgets.addButton(null, "Load cubemap", { callback: function() {
			info_widget.setValue("Loading...");
			var texture = GL.Texture.cubemapFromURL( LS.ResourcesManager.getFullURL( url ), cubemap_options , function(tex){
				var fullname = name + "_" + mode + ".png";
				LS.ResourcesManager.registerResource( fullname, texture );
				if(original_file)
					texture._original_file = original_file;
				else
					LS.ResourcesManager.getURLasFile( url, function(file) { texture._original_file = file; }); //keep the original file in case we want to save it
				info_widget.setValue("Cubemap created with name: " + fullname);
			});
		}});

		function computePosition()
		{
			var camera = RenderModule.selected_camera;
			var position = vec3.create();
			var node = SelectionModule.getSelectedNode();

			if(center == "camera eye")
				position = camera.getEye();
			else if(center == "camera target")
				position = camera.getCenter();
			else if(center == "node" && node && node.transform )
				position = node.transform.getGlobalPosition();
			return position;
		}
	},

	generateCubemap: function(resolution, position )
	{
		var position = position || RenderModule.selected_camera.getEye();
		
		var canvas = document.createElement("canvas");
		canvas.width = resolution;
		canvas.height = resolution*6;
		var ctx = canvas.getContext("2d");
		//document.body.appendChild(canvas); document.body.scrollTop = 10000;

		var cams = LS.Camera.cubemap_camera_parameters;

		for(var i = 0; i < 6; ++i)
		{
			gl.viewport( 0, 0, resolution, resolution );
			//gl.clearColor( Math.abs(cams[i].dir[0]), Math.abs(cams[i].dir[1]), Math.abs(cams[i].dir[2]), 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cam_info = { eye: position, center: [ position[0] + cams[i].dir[0], position[1] + cams[i].dir[1], position[2] + cams[i].dir[2]], up: cams[i].up, fov: 90, aspect: 1.0, near: 0.01, far: 1000 };
			var camera = new LS.Camera(cam_info);
			LS.Renderer.renderFrame( camera, RenderModule.render_options );
			var frame = gl.snapshot( 0, 0, resolution, resolution );
			//ctx.drawImage( gl.canvas, 0, gl.canvas.height - resolution, resolution, resolution, 0,resolution*i, resolution, resolution );
			ctx.drawImage( frame, 0, 0, resolution, resolution, 0,resolution*i, resolution, resolution );
		}

		return canvas;

		/*
		var data = canvas.toDataURL("image/png");
		data = data.substr(22, data.length);
		var dataType = "base64";
		var filename = "cubemap.png";
		LiteGUI.showDownloadFile(filename,data,dataType);
		*/
	},

	convertCubemapToPolar: function(cubemap_texture, size, target_texture)
	{
		if(!cubemap_texture || cubemap_texture.texture_type != gl.TEXTURE_CUBE_MAP) {
			trace("No cubemap found");
			return null;
		}

		size = size || 256;
		var canvas = document.createElement("canvas");
		canvas.width = canvas.height = size;
		//$("body").append(canvas);

		var texture = target_texture || new GL.Texture(size,size,{minFilter: gl.NEAREST});
		texture.drawTo(function() {
			gl.viewport(0,0,size,size);
			gl.disable(gl.DEPTH_TEST);
			gl.disable(gl.CULL_FACE);
			gl.disable(gl.BLEND);
			gl.clearColor(1,1,1,1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			cubemap_texture.bind();
			var shader = ShadersManager.get("cubemap_to_polar");
			//var shader = ShadersManager.get("screen");
			if(!shader)
				throw("No shader");

			cubemap_texture.toViewport( shader );
			//shader.uniforms({color:[1,1,1,1], texture: 0}).draw( RenderModule.viewport3d.screen_plane );

			var ctx = canvas.getContext("2d");
			var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
			buffer = pixels.data;
			var buffer = new Uint8Array(size*size*4);
			gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,buffer);
			//for(var i = 0; i < buffer.length; ++i) { pixels.data[i] = buffer[i]; }
			pixels.data.set(buffer);
			ctx.putImageData(pixels, 0, 0);
		});

		//document.body.appendChild(canvas);
		ResourcesManager.processImage("cubemap_" + (Math.random()*1000).toFixed(),canvas);
		return texture;
	}
}

LiteGUI.registerModule( CubemapGenerator );


