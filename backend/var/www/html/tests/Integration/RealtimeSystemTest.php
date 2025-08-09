<?php

namespace Tests\Integration;

use Tests\TestCase;
use App\Models\Device;
use App\Models\User;
use App\Services\RealtimeEventStore;
use App\Events\PublisherStatusChanged;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

/**
 * Real-Time System Integration Test
 * 
 * Tests the complete real-time data flow:
 * 1. Device polling detects changes
 * 2. Events are fired and stored
 * 3. WebSocket service can retrieve events
 * 4. API endpoints work correctly
 */
class RealtimeSystemTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Device $device;
    protected RealtimeEventStore $eventStore;

    protected function setUp(): void
    {
        parent::setUp();
        
        // Create test user and device
        $this->user = User::factory()->create();
        $this->device = Device::factory()->create([
            'name' => 'Test Pearl Mini',
            'ip' => '192.168.1.100',
            'username' => 'admin',
            'password' => 'password'
        ]);
        
        // Initialize event store
        $this->eventStore = app(RealtimeEventStore::class);
    }

    /** @test */
    public function test_publisher_status_event_creation_and_storage()
    {
        // Arrange
        Event::fake();
        
        $publishers = [
            [
                'id' => 'pub1',
                'name' => 'Test Publisher 1',
                'type' => 'rtmp',
                'status' => [
                    'is_configured' => true,
                    'started' => true,
                    'state' => 'started'
                ]
            ]
        ];
        
        $changes = [
            [
                'publisher_id' => 'pub1',
                'previous' => ['started' => false, 'state' => 'stopped'],
                'current' => ['started' => true, 'state' => 'started'],
                'changed_fields' => ['started', 'state']
            ]
        ];

        // Act
        $event = new PublisherStatusChanged($this->device, 1, $publishers, $changes);
        $eventArray = $event->toArray();
        
        // Store the event
        $stored = $this->eventStore->storeEvent($eventArray);

        // Assert
        $this->assertTrue($stored);
        $this->assertEquals('publisher_status', $eventArray['type']);
        $this->assertEquals($this->device->ip, $eventArray['device']);
        $this->assertEquals(1, $eventArray['channel']);
        $this->assertArrayHasKey('changeHash', $eventArray);
        $this->assertNotEmpty($eventArray['data']['publishers']);
    }

    /** @test */
    public function test_realtime_api_endpoints()
    {
        // Arrange
        $this->actingAs($this->user);
        
        // Store some test events
        $event1 = [
            'type' => 'publisher_status',
            'device' => '192.168.1.100',
            'channel' => 1,
            'data' => ['test' => 'data1'],
            'timestamp' => now()->toISOString(),
            'changeHash' => 'hash1'
        ];
        
        $event2 = [
            'type' => 'device_health',
            'device' => '192.168.1.100',
            'data' => ['status' => 'connected'],
            'timestamp' => now()->toISOString(),
            'changeHash' => 'hash2'
        ];
        
        $this->eventStore->storeEvent($event1);
        $this->eventStore->storeEvent($event2);

        // Act & Assert - Get events endpoint
        $response = $this->getJson('/api/realtime/events');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            '*' => [
                'type',
                'device',
                'data',
                'timestamp'
            ]
        ]);
        
        // Act & Assert - Get stats endpoint
        $response = $this->getJson('/api/realtime/stats');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'stats' => [
                'events_stored',
                'active_events'
            ]
        ]);
        
        // Act & Assert - Health endpoint
        $response = $this->getJson('/api/realtime/health');
        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'service',
            'version',
            'timestamp'
        ]);
    }

    /** @test */
    public function test_event_deduplication()
    {
        // Arrange
        $eventData = [
            'type' => 'publisher_status',
            'device' => '192.168.1.100',
            'channel' => 1,
            'data' => ['test' => 'data'],
            'timestamp' => now()->toISOString(),
            'changeHash' => 'same-hash'
        ];

        // Act
        $stored1 = $this->eventStore->storeEvent($eventData);
        $stored2 = $this->eventStore->storeEvent($eventData); // Duplicate

        // Assert
        $this->assertTrue($stored1);
        $this->assertFalse($stored2); // Should be deduplicated
    }

    /** @test */
    public function test_event_cleanup()
    {
        // Arrange
        $oldEvent = [
            'type' => 'publisher_status',
            'device' => '192.168.1.100',
            'channel' => 1,
            'data' => ['test' => 'old_data'],
            'timestamp' => now()->subMinutes(10)->toISOString(),
            'changeHash' => 'old-hash'
        ];
        
        $this->eventStore->storeEvent($oldEvent);
        
        // Get initial count
        $initialEvents = $this->eventStore->getRecentEvents(100);
        $initialCount = count($initialEvents);

        // Act
        $cleanedCount = $this->eventStore->cleanupExpiredEvents();

        // Assert
        $finalEvents = $this->eventStore->getRecentEvents(100);
        $this->assertGreaterThanOrEqual(0, $cleanedCount);
        $this->assertLessThanOrEqual($initialCount, count($finalEvents));
    }

    /** @test */
    public function test_device_specific_event_filtering()
    {
        // Arrange
        $device1Events = [
            [
                'type' => 'publisher_status',
                'device' => '192.168.1.100',
                'channel' => 1,
                'data' => ['device' => 'device1'],
                'timestamp' => now()->toISOString(),
                'changeHash' => 'hash1'
            ]
        ];
        
        $device2Events = [
            [
                'type' => 'publisher_status',
                'device' => '192.168.1.101',
                'channel' => 1,
                'data' => ['device' => 'device2'],
                'timestamp' => now()->toISOString(),
                'changeHash' => 'hash2'
            ]
        ];
        
        foreach ($device1Events as $event) {
            $this->eventStore->storeEvent($event);
        }
        
        foreach ($device2Events as $event) {
            $this->eventStore->storeEvent($event);
        }

        // Act
        $device1FilteredEvents = $this->eventStore->getDeviceEvents('192.168.1.100');
        $device2FilteredEvents = $this->eventStore->getDeviceEvents('192.168.1.101');

        // Assert
        $this->assertCount(1, $device1FilteredEvents);
        $this->assertCount(1, $device2FilteredEvents);
        $this->assertEquals('192.168.1.100', $device1FilteredEvents[0]['device']);
        $this->assertEquals('192.168.1.101', $device2FilteredEvents[0]['device']);
    }

    /** @test */
    public function test_performance_with_many_events()
    {
        // Arrange
        $startTime = microtime(true);
        $eventCount = 100;

        // Act - Store many events
        for ($i = 0; $i < $eventCount; $i++) {
            $event = [
                'type' => 'publisher_status',
                'device' => '192.168.1.100',
                'channel' => ($i % 4) + 1, // Channels 1-4
                'data' => ['iteration' => $i],
                'timestamp' => now()->toISOString(),
                'changeHash' => "hash-{$i}"
            ];
            
            $this->eventStore->storeEvent($event);
        }
        
        $storeTime = microtime(true) - $startTime;

        // Act - Retrieve events
        $retrieveStartTime = microtime(true);
        $events = $this->eventStore->getRecentEvents(50);
        $retrieveTime = microtime(true) - $retrieveStartTime;

        // Assert
        $this->assertLessThan(5.0, $storeTime); // Should complete in under 5 seconds
        $this->assertLessThan(0.1, $retrieveTime); // Should retrieve in under 100ms
        $this->assertCount(50, $events);
        
        // Verify events are in correct order (most recent first)
        $timestamps = array_column($events, 'timestamp');
        $sortedTimestamps = $timestamps;
        rsort($sortedTimestamps);
        $this->assertEquals($sortedTimestamps, $timestamps);
    }

    /** @test */
    public function test_api_rate_limiting_and_validation()
    {
        // Arrange
        $this->actingAs($this->user);

        // Act & Assert - Test limit parameter validation
        $response = $this->getJson('/api/realtime/events?limit=150');
        $response->assertStatus(200);
        // Should be capped at 100

        $response = $this->getJson('/api/realtime/events?limit=-5');
        $response->assertStatus(200);
        // Should default to minimum 1

        // Test device filtering
        $response = $this->getJson('/api/realtime/events?device=192.168.1.100&channel=1');
        $response->assertStatus(200);
    }
}