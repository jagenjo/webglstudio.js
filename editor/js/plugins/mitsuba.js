//WORK IN PROGRESS

var MitsubaTool = {

	name: "mitsuba",
	preferences: {
		server_url: ""
	},

	host_url: "http://tamats.com/projects/webglstudio/serverapps/mitsuba/",
	user_folder: "",

	meshes_format: "obj",//"serialized", //"obj"
	mesh_version: 3,
	mesh_bom: 0x041C, //0x1C04 //move somehwere else

	console: null,

	_meshes: [],
	_meshes_by_name: {},

	init: function()
	{
		LS.Network.requestScript("js/extra/pako.js");
		LiteGUI.menubar.add("Window/Mitsuba", { callback: function() { MitsubaTool.showDialog(); }});
	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Window/Mitsuba");
	},

	showDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog( { title: "Mitsuba", close: true, width: 1000, height: 450, scroll: false, resizable: true, draggable: true } );

		var settings = {
			resolution: [1024,768],
			samples: 64,
			max_depth: 4,
			integrator: 'bdpt',
			light_factor: 1000
		};

		var show_image_widget = null;

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["30%",null]);
		dialog.add(area);
		
		var inspector_left = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		inspector_left.addTitle("Settings");
		inspector_left.addString("URL", this.preferences.server_url, { placeHolder: "url without protocol", callback: function(v){
			that.preferences.server_url = v;
		}});

		inspector_left.addButton("Connection","Connect to server", { callback: function(){ that.onTestServer( that.connectToServer.bind(that) ); }});
		inspector_left.addTitle("Rendering");
		inspector_left.addCombo("Quality","High",{ values:["Low","Medium","High"] });
		//inspector_left.addCombo("Meshes Format", this.meshes_format ,{ values:["serialized","obj","spheres"], callback: function(v){ MitsubaTool.meshes_format = v; }});
		inspector_left.addCombo("Resolution","Viewport",{ values:["Viewport","VGA","720p","1080p","4K","Custom"], callback: function(v){
			switch(v)
			{
				case "SVGA": settings.resolution = [ 800, 600 ]; break;
				case "720p": settings.resolution = [ 1280, 720 ]; break;
				case "720p": settings.resolution = [ 1280, 720 ]; break;
				case "1080p": settings.resolution = [ 1920, 1080 ]; break;
				case "4K": settings.resolution = [ 1920, 1080 ]; break;
				default:
				case "Viewport": settings.resolution = [ gl.canvas.width, gl.canvas.height ]; break;
			}
		}});
		inspector_left.addSeparator();
		inspector_left.addButton( null, "Send SCENE", { callback: function(){
			that.prepareRender( settings );
		}});
		inspector_left.addButton( null, "Render Frame", { callback: function(){
			that.launchRender();
		}});
		inspector_left.addSeparator();
		inspector_left.addButton( null, "Download XML", { callback: function(){
			var xml = that.buildXML( settings );
			LiteGUI.downloadFile( "scene.xml", xml );
		}});
		inspector_left.addButton( null, "Download MESHES", { callback: function(){
			var file = null;
			if( MitsubaTool.meshes_format == "serialized" )
			{
				file = that.generateMeshSerialized();
				LiteGUI.downloadFile( "meshes.serialized", file );
			}
			else if( MitsubaTool.meshes_format == "obj" )
			{
				that.generateMeshesZIP( function(data) {
					var file = new Blob([data]);
					LiteGUI.downloadFile( "meshes.zip", file );
				});
			}
		}});
		show_image_widget = inspector_left.addButton( "Result", "Show Image", { callback: function(){
			window.open( MitsubaTool.host_url + "/" + MitsubaTool.user_folder + "/scene.png", "_blank" );
		}});

		area.getSection(0).add( inspector_left );

		var console_area = area.getSection(1);
		var console = this.console;
		if(!console)
		{
			this.console = console = new LiteGUI.Console();
			this.console.root.style.fontSize = "0.8em";
		}
		console_area.add( console );
		console.addMessage("not connected");

		dialog.show();
	},

	onTestServer: function( on_ready )
	{
		var that = this;
		if(!this.preferences.server_url)
			return that.console.error("No server specified");
		that.console.log("testing connection...");
		LS.Network.requestJSON( "http://" + this.preferences.server_url, function(v){
			if( v.server == "mitsuba" )
			{
			    that.console.addMessage("connection OK","good");
				if( on_ready )
					on_ready();
			}
			else
			    that.console.error("wrong server connertion");
		}, function(err){
			that.console.error("error connecting to server");
		});
	},

	connectToServer: function( on_ready )
	{
		var that = this;
		that.console.log("connecting to server...");
		var ws = this.socket;
		if( ws && ws.readyState == WebSocket.OPEN )
		{
			if(on_ready)
				on_ready();
			return;
		}

		ws = this.socket = new WebSocket( "ws://" + this.preferences.server_url );
		ws.onopen = function(){
			that.console.addMessage("connection established","good");
			if(on_ready)
				on_ready();
		}

		ws.onmessage = function( msg )
		{
			//that.console.log( "message:", msg.data );
			that.onMessage( msg.data, msg );
		}

		ws.onclose = function(err)
		{
			that.console.warn("connection closed");
		}
	},

	last_message: null,

	onMessage: function( msg )
	{
		if(msg.constructor === String)
			msg = JSON.parse( msg );
		else //binary
		{
			console.log("bin data received");
			return;
		}

		if(msg.action == "log")
		{
			var lines = msg.content.split("\n");
			for(var i in lines)
			{
				var line = lines[i];
				var index = line.indexOf("\r");
				if( this.last_message && index != -1 )
					this.last_message.update( "] " + line.substr(index+1) );
				else
					this.last_message = this.console.log( "] " + line );
			}
		}
		else if(msg.action == "error")
		{
			this.console.error( "] " + msg.content );
		}
		else if(msg.action == "warn")
		{
			this.console.warn( "] " + msg.content );
		}
		else if( msg.action == "info" )
		{
			this.user_folder = msg.folder;
		}
		else if( msg.action == "frame_ready" )
		{
			this.console.addMessage( "Frame ready. <a href='" + this.host_url + "/" + msg.url +"' target='_blank'>Click here to open</a>", "good" );
			var audio = new Audio('data/bell.wav');
			audio.play();
		}
	},

	//sends all the data to the server
	prepareRender: function( settings, on_complete )
	{
		if(!this.socket || this.socket.readyState != WebSocket.OPEN )
		{
			this.console.error("no connected to server");
			return;
		}

		var that = this;
		var xml = this.buildXML( settings );
		var zip = null;
		this._scene_xml = xml;

		//optional?
		this.generateMeshesZIP( function(data) {
			zip = data;
			setTimeout( inner_ready, 1 ); //break the encapsulation
		});

		function inner_ready()
		{
			that.sendToServer( { action:"scene", xml: xml } );
			that.sendFileToServer( "data.zip", zip );
		}
	},

	launchRender: function( settings, on_complete )
	{
		this.sendToServer( { action:"renderFrame", xml: this._scene_xml } );
	},

	sendFileToServer: function( filename, data )
	{
		this.console.log("Sending File: " + filename + " Size: " + data.byteLength );
		this.sendToServer( { action:"startbin", filename: filename } );
		this.sendToServer( data );
		this.sendToServer( { action:"endbin", size: data.byteLength, unzip: true } );
	},

	sendToServer: function( data, packet_size )
	{
		if(data.constructor === Object)
		{
			this.socket.send( JSON.stringify(data) );
			return;
		}
		else if(data.constructor === String)
		{
			this.socket.send( JSON.stringify( { action: "str", content: data }));
			return;
		}
		
		var that = this;

		//bin files: partition
		packet_size = packet_size || 1024;
		var array = data.constructor === ArrayBuffer ? new Uint8Array( data ) : data;

		var num_packets = Math.ceil( array.length / packet_size );
		var pos = 0;

		for(var i = 0; i < num_packets; ++i)
		{
			var size = Math.min( packet_size, array.length - pos );
			if( size <= 0 )
				break;
			var packet = array.subarray( pos, pos + packet_size );
			this.socket.send( packet );
			pos += size;
			//this.console.log("packed sent: " + i + "/" + num_packets )
		}

		var msg = this.console.log("Sending... Progress: " + ( array.length - this.socket.bufferedAmount ) + "/" + array.length );

		var timer = setInterval( inner_progress, 100 );

		function inner_progress()
		{
			msg.update("Sending... Progress: " + ( array.length - that.socket.bufferedAmount ) + "/" + array.length );
			if( that.socket.bufferedAmount == 0 )
				clearInterval(timer);
		}
	},

	buildXML: function( settings, scene )
	{
		settings = settings || {};
		scene = scene || LS.GlobalScene;

		if(!settings.integrator) settings.integrator = 'bdpt';
		if(!settings.resolution) settings.resolution = [gl.canvas.width,gl.canvas.height];
		if(!settings.samples) settings.samples = 64;
		if(!settings.max_depth) settings.max_depth = 4;

		var xml = '<?xml version="1.0" encoding="utf-8"?>\n<scene version="0.5.0">\n';

		//add integrator (global settings)
		xml += this.globalSettingsToXML( settings );

		//get scene info
		var camera = RenderModule.getActiveCamera(); //LS.GlobalScene.getCamera();
		var ris = scene._instances;
		var lights = scene._lights;
		var materials = LS.Renderer._visible_materials;

		//add materials 
		for(var i in materials)
		{
			var mat = materials[i];
			xml += this.materialToXML( mat );
		}
		
		//add shapes (render instances)
		for(var i in ris)
			xml += this.renderInstanceToXML( ris[i] );

		//add lights 
		for(var i in lights)
			xml += this.lightToXML( lights[i], settings );

		xml += this.sceneToXML( scene );

		//add sensor (camera)
		xml += this.cameraToXML( camera, settings );

		return xml + '</scene>';
	},

	materialToXML: function( material )
	{
		if( material.constructor !== LS.MaterialClasses.StandardMaterial )
		{
			console.warn("Material not supported:", material);
			return "";
		}

		var type = 'diffuse';
		//if( material.reflection )
		//	type = 'roughdielectric';

		var xml = '<bsdf type="'+type+'" id="'+material.uid.substr(1)+'">\n';
		xml += '	<srgb name="reflectance" value="'+tohex(material.color)+'"/>\n';
		xml += '	<float name="alpha" value="'+material.opacity.toFixed(2)+'"/>\n';
		return xml + "</bsdf>\n";

		function tohex(color)
		{
			return RGBToHex(color[0],color[1],color[2]);
		}
	},

	renderInstanceToXML: function( instance )
	{
		var type = 'sphere';

		//codify mesh into OBJ
		var index = -1;
		var obj = null;
		if( this.meshes_format == "serialized" )
		{
			type = "serialized";
			index = this.getSerializedMeshIndex( instance.mesh, instance );
		}
		else if( this.meshes_format == "obj" ) 
		{
			type = "obj";
			obj = this.getMeshOBJ( instance.mesh, instance );
		}

		//add to list of files to send
		//reference here

		var mat = mat4.transpose( mat4.create(), instance.matrix );

		var xml = '<shape type="'+type+'">\n';
		if( index != -1 )
		{
			xml += '	<string name="filename" value="meshes.serialized"/>\n';
			xml += '	<integer name="shapeIndex" value="'+index+'"/>\n';
		}
		else if( obj )
		{
			xml += '	<string name="filename" value="'+obj+'"/>\n';
		}

		xml += '	<transform name="toWorld">\n\
			<matrix value="'+mat.toString()+'"/>\n\
		</transform>\n\
		<ref id="'+instance.material.uid.substr(1)+'"/>\n</shape>\n';
		return xml;
	},

	lightToXML: function( light, settings )
	{
		var type = null;
		switch(light.type)
		{
			case LS.Light.OMNI:	type = "point"; break;
			case LS.Light.SPOT: type = "spot"; break;
			case LS.Light.DIRECTIONAL: type = "directional"; break;
		}

		var factor = settings.light_factor || 1000;
		var radiance = [ light.color[0] * light.intensity * factor, light.color[1] * light.intensity * factor, light.color[2] * light.intensity * factor];

		var mat = light.getTransformMatrix();
		mat4.transpose( mat, mat );

		//<lookat origin="'+light.position.toString()+'" target="'+light.target.toString()+'"/>\n

		var xml = '<emitter type="'+type+'">\n\
		<transform name="toWorld">\n\
			<matrix value="'+mat.toString()+'"/>\n\
		</transform>\n\
		<spectrum name="intensity" value="'+radiance.toString()+'"/>\n';

		if( light.type === LS.Light.SPOT )
			xml += '		<float name="cutoffAngle" value="'+light.angle.toFixed(2)+'"/>\n';
		xml += "</emitter>\n";
		return xml;
	},

	cameraToXML: function( camera, settings )
	{
		var xml = '<sensor type="'+ (camera.type === LS.Camera.PERSPECTIVE ? 'perspective' : 'orthographic') +'">\n\
		<float name="farClip" value="'+camera.far+'"/>\n\
		<float name="focusDistance" value="'+camera.focalLength+'"/>\n\
		<float name="fov" value="'+camera.fov+'"/>\n\
		<string name="fovAxis" value="x"/>\n\
		<float name="nearClip" value="'+camera.near+'"/>\n\
		<transform name="toWorld">\n\
			<lookat target="'+camera.center.toString()+'" origin="'+camera.eye.toString()+'" up="'+camera.up.toString()+'"/>\n\
		</transform>\n\
		<sampler type="independent">\n\
			<integer name="sampleCount" value="'+settings.samples+'"/>\n\
		</sampler>\n\
		<film type="hdrfilm">\n\
			<integer name="height" value="'+settings.resolution[1].toFixed(0)+'"/>\n\
			<integer name="width" value="'+settings.resolution[0].toFixed(0)+'"/>\n\
			<rfilter type="gaussian"/>\n\
		</film>\n</sensor>\n';
		return xml;
	},

	sceneToXML: function( scene )
	{
		var ambient = scene.info ? scene.info.ambient_color : [0,0,0];
		return '<emitter type="constant">\n\
		<spectrum name="radiance" value="'+ambient.toString()+'"/>\n</emitter>\n';
	},

	globalSettingsToXML: function( settings )
	{
		return '<integrator type="'+settings.integrator+'">\n\
		<integer name="shadingSamples" value="'+settings.samples+'"/>\n\
		<integer name="maxDepth" value="'+settings.max_depth+'"/>\n</integrator>\n';
	},

	getMeshOBJ: function( mesh, instance )
	{
		var filename = mesh.fullpath || mesh.filename || instance.uid;
		filename += ".obj";
		var mesh_info = this._meshes_by_name[ filename ];
		if( mesh_info )
			return mesh_info.filename;

		mesh_info = { filename: filename, data: mesh.encode("obj") };
		this._meshes.push( mesh_info );
		this._meshes_by_name[ filename ] = mesh_info;
		return mesh_info.filename;
	},

	generateMeshesZIP: function( on_complete )
	{
		var zip = new JSZip();
		for(var i in this._meshes)
		{
			var mesh_info = this._meshes[i];
			zip.file( mesh_info.filename, mesh_info.data );
		}
		if( on_complete )
			zip.generateAsync({type:"ArrayBuffer"}).then( on_complete );
	},

	getSerializedMeshIndex: function( mesh )
	{
		var filename = mesh.fullpath || mesh.filename;
		var mesh_info = this._meshes_by_name[ filename ];
		if(!mesh_info)
		{
			var data = this.meshToSerializedData( mesh );
			mesh_info = { index: this._meshes.length + 1, filename: filename, data: data };
			this._meshes.push( mesh_info );
			this._meshes_by_name[ filename ] = mesh_info;
		}
		return mesh_info.index;
	},

	meshToSerializedData: function( mesh, instance )
	{
		var stream = new Stream(1024,true);
		var mask = 0x0001 | 0x0002 | 0x1000; //normals + uvs + 32bits
		stream.writeUint32( mask );
		if(this.mesh_version == 4)
			stream.writeString( "foo", true );

		var vertices,normals,coords,indices;

		if( mesh.constructor === GL.Mesh )
		{
			vertices = mesh.getVertexBuffer("vertices").data;
			normals = mesh.getVertexBuffer("normals").data;
			coords = mesh.getVertexBuffer("coords").data;
			indices = mesh.getIndexBuffer("triangles").data;
		}
		else
		{
			vertices = mesh.vertices;
			normals = mesh.normals;
			coords = mesh.coords;
			indices = mesh.triangles;
		}

		stream.writeInt64( vertices.length / 3 );
		stream.writeInt64( indices.length / 3 );

		stream.writeArray( vertices );
		stream.writeArray( normals );
		stream.writeArray( coords );

		stream.writeArray( new Uint32Array( indices ) );
		var pack_data = stream.finalize();


		var options = {
			level: pako.Z_DEFAULT_COMPRESSION,
			method: pako.Z_DEFLATED,
			chunkSize: 16384,
			windowBits: 15+16, //15+16
			memLevel: 8,
			strategy: pako.Z_DEFAULT_STRATEGY
		};

		var deflated_data = pako.deflate( pack_data, options );

		var final_stream = new Stream( deflated_data.length + 2, true );
		final_stream.writeUint16( this.mesh_bom ); //header
		final_stream.writeUint16( this.mesh_version ); //version
		final_stream.writeArray( deflated_data );
		return final_stream.finalize();
	},

	serializedDataToMesh: function(data, version)
	{
		var stream = new Stream( data, true );
		var mask = stream.readUint32();
		console.log("Mask:",mask.toString(2));

		if( version == 4 )
		{
			var name = stream.readString(false);
			console.log("mesh name:", name );
		}

		var num_vertices = stream.readUint64();
		var num_triangles = stream.readUint64();
		console.log("vertices",num_vertices,"tris",num_triangles);
		if(!num_vertices || !num_triangles)
			throw("empty mesh");

		var vertices = new Float32Array( num_vertices * 3 );
		var normals = null;
		var coords = null;

		stream.readFloat32Array( vertices );

		if( mask & 0x1 )
		{
			normals = new Float32Array( num_vertices * 3 );
			stream.readFloat32Array( normals );
		}

		if( mask & 0x2 )
		{
			coords = new Float32Array( num_vertices * 2 );
			stream.readFloat32Array( coords );
		}

		var indices = new Uint32Array( num_triangles * 3 );
		stream.readUint32Array( indices );

		var mesh = { 
			object_class: "Mesh",
			vertices: vertices,
			normals: normals,
			coords: coords,
			triangles: indices
		};
		return mesh;
	},

	generateMeshSerialized: function()
	{
		var version = this.mesh_version;
		var bytes_per_dict_entry = 4; //( version == 3 ? 4 : 8 );
		var num_meshes = this._meshes.length;

		//compute total file size		
		var size = 0;
		for(var i = 0; i < num_meshes; ++i)
			size += this._meshes[i].data.length;
		size += num_meshes * bytes_per_dict_entry + 4; //space for the dictionary

		//pack all meshes together
		var packed_data = new Uint8Array( size );
		var pos = 0;
		var dictionary_stream = new Stream(1024,true);
		for(var i = 0; i < num_meshes; ++i)
		{
			var mesh_info = this._meshes[i];
			if(bytes_per_dict_entry == 4)
				dictionary_stream.writeUint32(pos);
			else //8
				dictionary_stream.writeUint64(pos);
			packed_data.set( mesh_info.data, pos );
			pos += mesh_info.data.length;
		}

		//append the dictionary
		dictionary_stream.writeUint32( num_meshes );
		var dict = dictionary_stream.finalize();
		packed_data.set( dict, pos );

		if( dict.length + pos != packed_data.length )
			console.warn("size discrepancy");

		//create file
		var file = new Blob( [packed_data] );
		return file;
	}
};

CORE.registerPlugin( MitsubaTool );

//Format
/*
var parserMitsubaXML = {
	extension: "xml",
	subextension: "mitsuba",
	type: "scene",
	resource: "SceneNode",
	format: "text",
	dataType:'text',

	parse: function( data, options, filename )
	{
		if(!data || data.constructor !== String)
		{
			console.error("XML parser requires string");
			return null;
		}
	}
}

LS.Formats.addSupportedFormat( "xml", parserMitsubaXML );
*/

var parserMitsubaSerialized = {
	extension: "serialized",
	subextension: "mitsuba",
	type: "scene",
	resource: "SceneNode",
	format: "binary",
	dataType:'binary',

	parse: function( data, options, filename )
	{
		var v = new Uint8Array( data );
		var stream = new Stream( data, true );
		if( stream.readUint16() != 0x041C )
			throw("wrong serialized format header");
		var version = stream.readUint16();
		console.log("version:",version);

		var dv = new DataView( data );
		var num_meshes = dv.getUint32( data.byteLength - 4, true );
		console.log( "num meshes:", num_meshes );

		var scene = { object_class: "SceneTree", root: {}, meshes: {} };

		var meshes = [];
		var bytes_in_offset = version == 3 ? 4 : 8;
		for(var i = 0; i < num_meshes; ++i)
		{
			var mesh_info = { index: i+1 };
			//guess offsets
			mesh_info.offset = dv.getUint32( data.byteLength - ((num_meshes - i) * bytes_in_offset + 4), true );
			if( i != (num_meshes - 1) )
				mesh_info.length = dv.getUint32( data.byteLength - ((num_meshes - i-1) * bytes_in_offset + 4), true ) - mesh_info.offset;
			else
				mesh_info.length = data.byteLength - ( i*bytes_in_offset + 4 ) - mesh_info.offset;
			console.log( "mesh:", mesh_info.index, mesh_info.offset, mesh_info.length );

			var mesh_data = v.subarray(4 + mesh_info.offset, 4 + mesh_info.offset + mesh_info.length);
			var version = v[ mesh_info.offset + 2 ];

			var inflated = pako.inflate( mesh_data );
			var mesh = MitsubaTool.serializedDataToMesh( inflated, version );

			var test = pako.deflate( inflated );
			if( test.length != mesh_data.length )
			{
				console.warn("data changes size after deflating again");
			}

			//debugger;
			//var deflated_again = MitsubaTool.meshToSerializedData( mesh, version );
			//debugger;

			mesh.filename = "mesh_" + i;
			scene.meshes[mesh.filename] = mesh;
		}

		//debug: lets build it again!
		/*
		for(var i in scene.meshes)
		{
			var mesh = scene.meshes[i];
			var glmesh = GL.Mesh.load( mesh );
			if(!glmesh.indexBuffers.triangles)
				glmesh.computeIndices();
			var index = MitsubaTool.getSerializedMeshIndex( glmesh );
		}
		var file = MitsubaTool.generateMeshSerialized();
		LiteGUI.downloadFile("mesh.serialized",file);
		//*/

		return scene;
	}
}

LS.Formats.addSupportedFormat( "serialized", parserMitsubaSerialized );


//used to save data continuously
function Stream( stream_or_size, little_endian )
{
	if( stream_or_size )		
	{
		if( stream_or_size.constructor === Number ) //usually for writing
			this.data = new Uint8Array( stream_or_size + Stream.margin );
		else if ( stream_or_size.constructor === ArrayBuffer ) //reading
			this.data = new Uint8Array( stream_or_size ); 
		else if( stream_or_size.constructor === Uint8Array ) 
			this.data = stream_or_size; //no clone
		else
		{
			console.error("unkown stream info:", stream_or_size.constructor.name );
			throw("unkown stream info:", stream_or_size );
		}
	}
	else
		this.data = new Uint8Array( 1024*1024 ); //default
	
	this.index = 0;
	this.view = new DataView( this.data.buffer );
	this.length = this.data.length;
	this.little_endian = little_endian !== undefined ? little_endian : true;
}

Stream.margin = 1024 * 2;

Stream.prototype.reset = function()
{
	this.check();
	this.index = 0;
}

Stream.prototype.check = function()
{
	if( isNaN( this.index ) )
		throw("NaN in events stream");
}

Stream.prototype.finalize = function()
{
	this.check();
	if(!this.index)
		return null;
	var r = new Uint8Array( this.data.subarray(0, this.index) ); //clone
	this.index = 0;
	return r;
}

Stream.prototype.eof = function()
{
	//this.check();
	return this.index == this.length;
}

Stream.prototype.resize = function( new_size )
{
	if(!new_size || new_size < this.length)
		throw("Stream cannot be resized to small size");

	var data = new Uint8Array( new_size + Stream.margin );
	data.set( this.data );
	this.data = data;
	this.view = new DataView( this.data.buffer );
	this.length = new_size;
}

Stream.prototype.writeParams = function( )
{
	var l = arguments.length;
	if( this.length < (this.index + l) )
		this.resize( this.length * 2 ); //double
	for(var i = 0; i < l; ++i)
		this.data[this.index + i] = arguments[i];
	this.index += l;
}

Stream.prototype.writeArray = function( array )
{
	var l = array.length;
	switch( array.constructor )
	{
		case Array:
		case Uint8Array:
		case Int8Array:
			if( this.length < (this.index + l) )
				this.resize( this.length * 2 ); //double
			this.data.set( array, this.index );
			this.index += l;
			break;
		case Uint32Array:
			if( this.length < (this.index + l*4) )
				this.resize( (this.length + l*4) * 2 ); //double
			var clone = new Uint32Array( array );
			var reuse = new Uint8Array( clone.buffer );
			this.data.set( reuse, this.index );
			this.index += reuse.length;
			break;
		case Float32Array:
			if( this.length < (this.index + l*4) )
				this.resize( (this.length + l*4) * 2 ); //double
			for(var i = 0; i < array.length; ++i)
				this.view.setFloat32( this.index + i * 4, array[i], this.little_endian );
			this.index += array.length * 4;
			break;
		default:
			throw("Stream only supports Uint8Array, Int8Array and Float32Array");
	}
}

Stream.prototype.writeString = function( str, use_utf8 )
{
	if( use_utf8 )
	{
		this.writeUTF8(str);
		return;
	}

	var l = str.length + 1;
	if( this.length <= this.index + l )
		this.resize( this.length * 2 ); //double
	for(var i = 0; i < str.length; ++i)
		this.view.setUint8( this.index + i, str.charCodeAt(i) );
	this.view.setUint8( this.index + str.length, 0 ); //null char
	this.index += l;
}

Stream.prototype.writeUint8 = function( v )
{
	if( this.length <= this.index + 1 )
		this.resize( this.length * 2 ); //double
	this.view.setUint8( this.index, v);
	this.index += 1;
}

Stream.prototype.writeInt8 = function( v )
{
	if( this.length <= this.index + 1 )
		this.resize( this.length * 2 ); //double
	this.view.setInt8( this.index, v);
	this.index += 1;
}

Stream.prototype.writeUint16 = function( v )
{
	if( this.length <= this.index + 2 )
		this.resize( this.length * 2 ); //double
	this.view.setUint16( this.index, v, this.little_endian);
	this.index += 2;
}

Stream.prototype.writeInt16 = function( v )
{
	if( this.length <= this.index + 2 )
		this.resize( this.length * 2 ); //double
	this.view.setInt16( this.index, v, this.little_endian);
	this.index += 2;
}

Stream.prototype.writeUint32 = function( v )
{
	if( this.length <= this.index + 4 )
		this.resize( this.length * 2 ); //double
	this.view.setUint32( this.index, v, this.little_endian);
	this.index += 4;
}

Stream.prototype.writeInt32 = function( v )
{
	if( this.length <= this.index + 4 )
		this.resize( this.length * 2 ); //double
	this.view.setInt32( this.index, v, this.little_endian);
	this.index += 4;
}

//typed arrays do not implement uint64 so we fake it with a uint32 padded with zeros
Stream.prototype.writeInt64 = function( v )
{
	if( this.length <= this.index + 8 )
		this.resize( this.length * 2 ); //double
	if( this.little_endian )
	{
		this.view.setInt32( this.index, v, this.little_endian );
		this.view.setInt32( this.index + 4, 0, this.little_endian );
	}
	else
	{
		this.view.setInt32( this.index, 0, this.little_endian );
		this.view.setInt32( this.index + 4, v, this.little_endian );
	}
	this.index += 8;
}

Stream.prototype.writeUint64 = function( v )
{
	if( this.length <= this.index + 8 )
		this.resize( this.length * 2 ); //double
	if( this.little_endian )
	{
		this.view.setUint32( this.index, 0, this.little_endian );
		this.view.setUint32( this.index + 4, v, this.little_endian );
	}
	else
	{
		this.view.setUint32( this.index, v, this.little_endian );
		this.view.setUint32( this.index + 4, 0, this.little_endian );
	}
	this.index += 8;
}


Stream.prototype.writeFloat32 = function( v )
{
	if( this.length <= this.index + 4 )
		this.resize( this.length * 2 ); //double
	this.view.setFloat32( this.index, v, this.little_endian);
	this.index += 4;
}

Stream.prototype.writeFloat64 = function( v )
{
	if( this.length <= this.index + 8 )
		this.resize( this.length * 2 ); //double
	this.view.setFloat64( this.index, v, this.little_endian);
	this.index += 8;
}

Stream.prototype.readBytes = function( bytes, clone )
{
	this.index += bytes;
	if(clone)
		return new Uint8Array( this.data.subarray( this.index - bytes, this.index ) );
	return this.data.subarray( this.index - bytes, this.index );
}

Stream.prototype.readFloat32Array = function( dest )
{
	for(var i = 0; i < dest.length; ++i )
		dest[i] = this.view.getFloat32( this.index + i * 4, this.little_endian );
	this.index += dest.length * 4;
}

Stream.prototype.readUint32Array = function( dest )
{
	for(var i = 0; i < dest.length; ++i )
		dest[i] = this.view.getUint32( this.index + i * 4, this.little_endian );
	this.index += dest.length * 4;
}

Stream.prototype.readUint8 = function()
{
	this.index += 1;
	return this.view.getUint8( this.index - 1 );
}

Stream.prototype.getUint8 = function()
{
	return this.view.getUint8( this.index );
}

Stream.prototype.readInt8 = function()
{
	this.index += 1;
	return this.view.getInt8( this.index - 1 );
}

Stream.prototype.getInt8 = function()
{
	return this.view.getInt8( this.index );
}

Stream.prototype.readUint16 = function()
{
	this.index += 2;
	return this.view.getUint16( this.index - 2, this.little_endian );
}

Stream.prototype.getUint16 = function()
{
	return this.view.getUint16( this.index, this.little_endian );
}

Stream.prototype.readInt16 = function()
{
	this.index += 2;
	return this.view.getInt16( this.index - 2, this.little_endian );
}

Stream.prototype.getInt16 = function()
{
	return this.view.getInt16( this.index, this.little_endian );
}

Stream.prototype.readUint32 = function()
{
	this.index += 4;
	return this.view.getUint32( this.index - 4, this.little_endian );
}

Stream.prototype.getUint32 = function()
{
	return this.view.getUint32( this.index, this.little_endian );
}

Stream.prototype.readInt32 = function()
{
	this.index += 4;
	return this.view.getInt32( this.index - 4, this.little_endian );
}

//assumes its a 32 ignoring high bytes...
Stream.prototype.readUint64 = function()
{
	this.index += 8;
	if(this.little_endian)
		return this.view.getUint32( this.index - 8, this.little_endian );
	else
		return this.view.getUint32( this.index - 4, this.little_endian );
}

Stream.prototype.getInt32 = function()
{
	return this.view.getInt32( this.index, this.little_endian );
}

Stream.prototype.readFloat32 = function()
{
	this.index += 4;
	return this.view.getFloat32( this.index - 4, this.little_endian );
}

Stream.prototype.getFloat32 = function()
{
	return this.view.getFloat32( this.index, this.little_endian );
}

Stream.prototype.readFloat64 = function()
{
	this.index += 8;
	return this.view.getFloat64( this.index - 8, this.little_endian );
}

Stream.prototype.getFloat64 = function()
{
	return this.view.getFloat64( this.index, this.little_endian );
}

Stream.prototype.readString = function( use_utf8 )
{
	if( use_utf8 )
		return this.readUTF8();

	var pos = this.index;
	var str = "";
	var c = null;
	while( c = this.view.getUint8( this.index++ ) )
		str += String.fromCharCode(c);
	return str;
}


Stream.prototype.writeObject = function( object )
{
	if(object.writeToStream)
		object.writeToStream( this );
	else
		throw("object doesnt implement writeToStream");
}

Stream.prototype.isEmpty = function()
{
	return this.index == 0;
}

Stream.prototype.writeUTF8 = function(s) {
	var i = 0;
	var bytes = new Uint8Array(s.length * 4);
	for (var ci = 0; ci != s.length; ci++) {
		var c = s.charCodeAt(ci);
		if (c < 128) {
			bytes[i++] = c;
			continue;
		}
		if (c < 2048) {
			bytes[i++] = c >> 6 | 192;
		} else {
			if (c > 0xd7ff && c < 0xdc00) {
				if (++ci == s.length) throw 'UTF-8 encode: incomplete surrogate pair';
				var c2 = s.charCodeAt(ci);
				if (c2 < 0xdc00 || c2 > 0xdfff) throw 'UTF-8 encode: second char code 0x' + c2.toString(16) + ' at index ' + ci + ' in surrogate pair out of range';
				c = 0x10000 + ((c & 0x03ff) << 10) + (c2 & 0x03ff);
				bytes[i++] = c >> 18 | 240;
				bytes[i++] = c>> 12 & 63 | 128;
			} else { // c <= 0xffff
				bytes[i++] = c >> 12 | 224;
			}
			bytes[i++] = c >> 6 & 63 | 128;
		}
		bytes[i++] = c & 63 | 128;
	}

	this.data.set( bytes.subarray(0, i), this.index );
	this.index += i;
}

// Unmarshals an Uint8Array to string.
Stream.prototype.readUTF8 = function() {
	var s = '';
	var i = this.index;
	var bytes = this.data;
	while (i < bytes.length) {
		var c = bytes[i++];
		if(c == 0)
		{
			this.index = i;
			return s; //tamat: need to break the string
		}
		if (c > 127) {
			if (c > 191 && c < 224) {
				if (i >= bytes.length) throw 'UTF-8 decode: incomplete 2-byte sequence';
				c = (c & 31) << 6 | bytes[i] & 63;
			} else if (c > 223 && c < 240) {
				if (i + 1 >= bytes.length) throw 'UTF-8 decode: incomplete 3-byte sequence';
				c = (c & 15) << 12 | (bytes[i] & 63) << 6 | bytes[++i] & 63;
			} else if (c > 239 && c < 248) {
				if (i+2 >= bytes.length) throw 'UTF-8 decode: incomplete 4-byte sequence';
				c = (c & 7) << 18 | (bytes[i] & 63) << 12 | (bytes[++i] & 63) << 6 | bytes[++i] & 63;
			} else throw 'UTF-8 decode: unknown multibyte start 0x' + c.toString(16) + ' at index ' + (i - 1);
			++i;
		}

		if (c <= 0xffff) 
			s += String.fromCharCode(c);
		else if (c <= 0x10ffff) {
			c -= 0x10000;
			s += String.fromCharCode(c >> 10 | 0xd800)
			s += String.fromCharCode(c & 0x3FF | 0xdc00)
		} else 
				throw 'UTF-8 decode: code point 0x' + c.toString(16) + ' exceeds UTF-16 reach';
	}
	return s;
}
